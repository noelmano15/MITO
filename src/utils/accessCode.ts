import crypto from 'node:crypto';
import type { AccessPolicy, AccessPresetId, UserAccount, VideoContent, GameItem } from '../types/mito';

/**
 * Formats any input string into the strict XXX-XXX-XXX 9-digit numeric format.
 */
export function formatAccessCodeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
}

/**
 * Strips hyphens and validates that a code is exactly 9 numeric digits.
 */
export function normalizeAccessCode(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) return null;
  return digits;
}

/**
 * Masks a 9-digit code so only the last 3 digits are shown: ***-***-756
 */
export function maskAccessCode(digits9: string): string {
  const clean = digits9.replace(/\D/g, '');
  const tail = clean.slice(-3).padStart(3, '0');
  return `***-***-${tail}`;
}

const PRESET_TO_DIGIT: Record<AccessPresetId, string> = {
  full: '1',
  demo: '2',
  viewer: '3',
  gamer: '4',
  custom: '5',
};

const DIGIT_TO_PRESET: Record<string, AccessPresetId> = {
  '1': 'full',
  '2': 'demo',
  '3': 'viewer',
  '4': 'gamer',
  '5': 'custom',
};

export function computeCodeChecksum3(prefix6: string, pepper: string): string {
  const digest = crypto
    .createHmac('sha256', `${pepper}:mito-code-v1`)
    .update(prefix6)
    .digest();
  const num = digest.readUInt32BE(0) % 1000;
  return num.toString().padStart(3, '0');
}

export function verifyGeneratedCodeChecksum(
  digits9: string,
  pepper: string
): { valid: boolean; preset: AccessPresetId } {
  const clean = normalizeAccessCode(digits9);
  if (!clean) return { valid: false, preset: 'full' };
  const prefix6 = clean.slice(0, 6);
  const suffix3 = clean.slice(6, 9);
  const expected3 = computeCodeChecksum3(prefix6, pepper);
  const preset = DIGIT_TO_PRESET[clean[0]] || 'full';
  return {
    valid: suffix3 === expected3,
    preset,
  };
}

/**
 * Generates a cryptographically secure 9-digit numeric access code (preserving leading zeros)
 * with an embedded 3-digit HMAC checksum so Admin-generated codes are verifiable across all instances.
 */
export function generateSecureAccessCode(
  existingHashes?: Set<string>,
  pepper = '',
  preset: AccessPresetId = 'full',
  customCodeInput?: string
): {
  formattedCode: string;
  digits: string;
  salt: string;
  hash: string;
  maskedCode: string;
} {
  if (customCodeInput) {
    const customDigits = normalizeAccessCode(customCodeInput);
    if (customDigits) {
      const formattedCode = `${customDigits.slice(0, 3)}-${customDigits.slice(3, 6)}-${customDigits.slice(6, 9)}`;
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashAccessCode(customDigits, salt, pepper);
      return {
        formattedCode,
        digits: customDigits,
        salt,
        hash,
        maskedCode: maskAccessCode(customDigits),
      };
    }
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const firstDigit = PRESET_TO_DIGIT[preset] || '1';
    const middle5 = crypto.randomInt(0, 100_000).toString().padStart(5, '0');
    const prefix6 = `${firstDigit}${middle5}`;
    const suffix3 = computeCodeChecksum3(prefix6, pepper);
    const digits = `${prefix6}${suffix3}`;
    const formattedCode = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashAccessCode(digits, salt, pepper);
    if (!existingHashes || !existingHashes.has(hash)) {
      return {
        formattedCode,
        digits,
        salt,
        hash,
        maskedCode: maskAccessCode(digits),
      };
    }
  }
  throw new Error('Dështoi gjenerimi i kodit unik të aksesit.');
}

/**
 * Hashes a 9-digit code using scrypt (memory-hard KDF) combined with a per-user salt and server-side pepper.
 */
export function hashAccessCode(digits9: string, salt: string, pepper: string): string {
  const normalized = normalizeAccessCode(digits9);
  if (!normalized) {
    throw new Error('Kodi i aksesit duhet të ketë saktësisht 9 shifra.');
  }
  const derived = crypto.scryptSync(`${normalized}:${pepper}`, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return derived.toString('hex');
}

/**
 * Timing-safe verification of a 9-digit code against a stored salt + hash.
 */
export function verifyAccessCode(digits9: string, salt: string, storedHash: string, pepper: string): boolean {
  const normalized = normalizeAccessCode(digits9);
  if (!normalized) return false;
  try {
    const candidateHash = hashAccessCode(normalized, salt, pepper);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Creates a reusable access policy preset.
 */
export function createAccessPolicyPreset(preset: AccessPresetId): AccessPolicy {
  switch (preset) {
    case 'demo':
      return {
        preset: 'demo',
        validFrom: null,
        expiresAt: null,
        accessDurationMinutes: 30,
        maxSessionDurationMinutes: 30,
        dailyUsageAllowanceMinutes: 20,
        manualExpiryOverride: false,
        contentScope: 'all',
        allowedContentIds: [],
        allowedCategoryIds: [],
        maxAvailableTitles: 3,
        maxPlaybackSecondsPerItem: 600,
        permittedStartSecond: null,
        permittedEndSecond: null,
        maxViewsPerItem: 2,
        restrictedEpisodeIds: [],
        streamingEnabled: true,
        shortsEnabled: true,
        soloGamesEnabled: false,
        quizzesEnabled: false,
        localMultiplayerEnabled: false,
        globalChallengesEnabled: false,
        allowedGameIds: [],
        restrictSelectedGames: false,
        dailyGameSessionLimit: 0,
        maxConcurrentSessions: 1,
        maxPermittedDevices: 1,
      };
    case 'viewer':
      return {
        preset: 'viewer',
        validFrom: null,
        expiresAt: null,
        accessDurationMinutes: 1440 * 7, // 7 days
        maxSessionDurationMinutes: 240,
        dailyUsageAllowanceMinutes: 180,
        manualExpiryOverride: false,
        contentScope: 'all',
        allowedContentIds: [],
        allowedCategoryIds: [],
        maxAvailableTitles: null,
        maxPlaybackSecondsPerItem: null,
        permittedStartSecond: null,
        permittedEndSecond: null,
        maxViewsPerItem: null,
        restrictedEpisodeIds: [],
        streamingEnabled: true,
        shortsEnabled: true,
        soloGamesEnabled: false,
        quizzesEnabled: true,
        localMultiplayerEnabled: false,
        globalChallengesEnabled: false,
        allowedGameIds: [],
        restrictSelectedGames: false,
        dailyGameSessionLimit: 3,
        maxConcurrentSessions: 2,
        maxPermittedDevices: 2,
      };
    case 'gamer':
      return {
        preset: 'gamer',
        validFrom: null,
        expiresAt: null,
        accessDurationMinutes: 1440 * 14, // 14 days
        maxSessionDurationMinutes: 300,
        dailyUsageAllowanceMinutes: 240,
        manualExpiryOverride: false,
        contentScope: 'all',
        allowedContentIds: [],
        allowedCategoryIds: [],
        maxAvailableTitles: null,
        maxPlaybackSecondsPerItem: null,
        permittedStartSecond: null,
        permittedEndSecond: null,
        maxViewsPerItem: null,
        restrictedEpisodeIds: [],
        streamingEnabled: true,
        shortsEnabled: true,
        soloGamesEnabled: true,
        quizzesEnabled: true,
        localMultiplayerEnabled: true,
        globalChallengesEnabled: true,
        allowedGameIds: [],
        restrictSelectedGames: false,
        dailyGameSessionLimit: 20,
        maxConcurrentSessions: 2,
        maxPermittedDevices: 3,
      };
    case 'full':
    case 'custom':
    default:
      return {
        preset,
        validFrom: null,
        expiresAt: null,
        accessDurationMinutes: null,
        maxSessionDurationMinutes: null,
        dailyUsageAllowanceMinutes: null,
        manualExpiryOverride: false,
        contentScope: 'all',
        allowedContentIds: [],
        allowedCategoryIds: [],
        maxAvailableTitles: null,
        maxPlaybackSecondsPerItem: null,
        permittedStartSecond: null,
        permittedEndSecond: null,
        maxViewsPerItem: null,
        restrictedEpisodeIds: [],
        streamingEnabled: true,
        shortsEnabled: true,
        soloGamesEnabled: true,
        quizzesEnabled: true,
        localMultiplayerEnabled: true,
        globalChallengesEnabled: true,
        allowedGameIds: [],
        restrictSelectedGames: false,
        dailyGameSessionLimit: null,
        maxConcurrentSessions: 5,
        maxPermittedDevices: 5,
      };
  }
}

export interface AccessEvaluationResult {
  allowed: boolean;
  reasonCode?: 'expired' | 'suspended' | 'revoked' | 'not_activated' | 'daily_limit' | 'permission_denied';
  messageSq?: string;
  remainingMinutes?: number | null;
  lowTimeWarningSq?: string | null;
}

/**
 * Evaluates whether a user account currently has active time & status access.
 */
export function evaluateAccountTimeAccess(user: UserAccount, nowMs = Date.now()): AccessEvaluationResult {
  if (user.role === 'super_admin') {
    return { allowed: true, remainingMinutes: null, lowTimeWarningSq: null };
  }

  if (user.status === 'suspended') {
    return {
      allowed: false,
      reasonCode: 'suspended',
      messageSq: 'Kontakti me administratorin kërkohet për të aktivizuar aksesin.',
    };
  }
  if (user.status === 'revoked') {
    return {
      allowed: false,
      reasonCode: 'revoked',
      messageSq: 'Sesioni yt ka përfunduar.',
    };
  }
  if (user.status === 'not_activated') {
    return {
      allowed: false,
      reasonCode: 'not_activated',
      messageSq: 'Kontakti me administratorin kërkohet për të aktivizuar aksesin.',
    };
  }
  if (user.status === 'expired' && !user.accessPolicy.manualExpiryOverride) {
    return {
      allowed: false,
      reasonCode: 'expired',
      messageSq: 'Sesioni yt ka përfunduar.',
    };
  }

  const policy = user.accessPolicy;
  if (policy.manualExpiryOverride) {
    return { allowed: true, remainingMinutes: null, lowTimeWarningSq: null };
  }

  if (policy.validFrom) {
    const startMs = new Date(policy.validFrom).getTime();
    if (!Number.isNaN(startMs) && nowMs < startMs) {
      return {
        allowed: false,
        reasonCode: 'not_activated',
        messageSq: 'Kontakti me administratorin kërkohet për të aktivizuar aksesin.',
      };
    }
  }

  let earliestExpiryMs: number | null = null;

  if (policy.expiresAt) {
    const expMs = new Date(policy.expiresAt).getTime();
    if (!Number.isNaN(expMs)) {
      earliestExpiryMs = expMs;
    }
  }

  const activationTimestamp = user.accessActivatedAt || user.firstLoginAt;
  if (policy.accessDurationMinutes && policy.accessDurationMinutes > 0 && activationTimestamp) {
    const activatedMs = new Date(activationTimestamp).getTime();
    if (!Number.isNaN(activatedMs)) {
      const durationExpiryMs = activatedMs + policy.accessDurationMinutes * 60_000;
      if (earliestExpiryMs === null || durationExpiryMs < earliestExpiryMs) {
        earliestExpiryMs = durationExpiryMs;
      }
    }
  }

  if (earliestExpiryMs !== null && nowMs >= earliestExpiryMs) {
    return {
      allowed: false,
      reasonCode: 'expired',
      messageSq: 'Sesioni yt ka përfunduar.',
      remainingMinutes: 0,
    };
  }

  // Daily usage allowance check
  const todayStr = new Date(nowMs).toISOString().slice(0, 10);
  const watchedMinutesToday =
    user.stats.lastActivityDate === todayStr ? Math.floor(user.stats.watchedSecondsToday / 60) : 0;

  let remainingDailyMinutes: number | null = null;
  if (policy.dailyUsageAllowanceMinutes !== null && policy.dailyUsageAllowanceMinutes !== undefined) {
    remainingDailyMinutes = Math.max(0, policy.dailyUsageAllowanceMinutes - watchedMinutesToday);
    if (remainingDailyMinutes <= 0) {
      return {
        allowed: false,
        reasonCode: 'daily_limit',
        messageSq: 'Sesioni yt ka përfunduar.',
        remainingMinutes: 0,
      };
    }
  }

  let remainingMinutes: number | null = null;
  if (earliestExpiryMs !== null) {
    remainingMinutes = Math.max(0, Math.ceil((earliestExpiryMs - nowMs) / 60_000));
  }
  if (remainingDailyMinutes !== null) {
    remainingMinutes =
      remainingMinutes === null ? remainingDailyMinutes : Math.min(remainingMinutes, remainingDailyMinutes);
  }

  const lowTimeWarningSq =
    remainingMinutes !== null && remainingMinutes <= 5
      ? `Ke akses edhe për ${remainingMinutes} minuta.`
      : null;

  return {
    allowed: true,
    remainingMinutes,
    lowTimeWarningSq,
  };
}

/**
 * Evaluates whether a user is permitted to open or stream a specific content item.
 */
export function evaluateContentAccess(
  user: UserAccount,
  content: VideoContent,
  distinctWatchedContentIds: string[],
  viewsForThisItem = 0
): AccessEvaluationResult {
  const timeCheck = evaluateAccountTimeAccess(user);
  if (!timeCheck.allowed) return timeCheck;
  if (user.role === 'super_admin') return timeCheck;

  const policy = user.accessPolicy;

  if (content.videoFormat === 'short' && !policy.shortsEnabled) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Ky material nuk është i disponueshëm për llogarinë tënde.',
    };
  }

  if (content.videoFormat === 'standard' && !policy.streamingEnabled) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Ky material nuk është i disponueshëm për llogarinë tënde.',
    };
  }

  if (policy.contentScope === 'selected_content' && !policy.allowedContentIds.includes(content.contentId)) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Ky material nuk është i disponueshëm për llogarinë tënde.',
    };
  }

  if (policy.contentScope === 'selected_categories') {
    const hasCategory = content.categoryIds.some((cid) => policy.allowedCategoryIds.includes(cid));
    if (!hasCategory) {
      return {
        allowed: false,
        reasonCode: 'permission_denied',
        messageSq: 'Ky material nuk është i disponueshëm për llogarinë tënde.',
      };
    }
  }

  if (
    policy.maxAvailableTitles !== null &&
    policy.maxAvailableTitles !== undefined &&
    policy.maxAvailableTitles > 0 &&
    !distinctWatchedContentIds.includes(content.contentId) &&
    distinctWatchedContentIds.length >= policy.maxAvailableTitles
  ) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Ky material nuk është i disponueshëm për llogarinë tënde.',
    };
  }

  if (
    policy.maxViewsPerItem !== null &&
    policy.maxViewsPerItem !== undefined &&
    viewsForThisItem >= policy.maxViewsPerItem
  ) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Ky material nuk është i disponueshëm për llogarinë tënde.',
    };
  }

  return timeCheck;
}

/**
 * Evaluates whether a user is permitted to play a specific game in a given mode.
 */
export function evaluateGameAccess(
  user: UserAccount,
  game: GameItem,
  mode: 'solo' | 'multiplayer' | 'global'
): AccessEvaluationResult {
  const timeCheck = evaluateAccountTimeAccess(user);
  if (!timeCheck.allowed) return timeCheck;
  if (user.role === 'super_admin') return timeCheck;

  const policy = user.accessPolicy;

  if (mode === 'solo' && !policy.soloGamesEnabled && !policy.quizzesEnabled) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
    };
  }

  if (mode === 'multiplayer' && !policy.localMultiplayerEnabled) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
    };
  }

  if (mode === 'global' && !policy.globalChallengesEnabled) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
    };
  }

  if (policy.restrictSelectedGames && !policy.allowedGameIds.includes(game.gameId)) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
    };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const sessionsToday = user.stats.lastActivityDate === todayStr ? user.stats.gameSessionsToday : 0;
  if (
    policy.dailyGameSessionLimit !== null &&
    policy.dailyGameSessionLimit !== undefined &&
    sessionsToday >= policy.dailyGameSessionLimit
  ) {
    return {
      allowed: false,
      reasonCode: 'permission_denied',
      messageSq: 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
    };
  }

  return timeCheck;
}
