import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { doc, getDoc } from 'firebase/firestore';
import dotenv from 'dotenv';

import {
  store,
  UPLOADS_DIR,
  firestoreDb,
  DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
  DEFAULT_GOOGLE_DRIVE_FOLDER_URL,
} from './src/server/store';
import {
  generateSecureAccessCode,
  hashAccessCode,
  verifyAccessCode,
  normalizeAccessCode,
  maskAccessCode,
  verifyGeneratedCodeChecksum,
  createAccessPolicyPreset,
  evaluateAccountTimeAccess,
  evaluateContentAccess,
  evaluateGameAccess,
} from './src/utils/accessCode';
import { parseMp4Buffer, createMinimalMp4Buffer, type ParsedMp4Metadata } from './src/utils/mp4Parser';
import {
  mergeWatchedSegments,
  calculateSegmentProgress,
  isGameUnlockedByWatchProgress,
} from './src/utils/watchToUnlock';
import {
  calculateQuestionScore,
  evaluateNewAchievements,
  sortLeaderboardEntries,
} from './src/utils/gameScoring';
import type {
  UserAccount,
  VideoContent,
  CategoryItem,
  EpisodeItem,
  MediaAsset,
  GameItem,
  GameQuestionFull,
  GameQuestionPublic,
  PlaybackProgressRecord,
  MultiplayerRoom,
  MultiplayerPlayer,
  LeaderboardEntry,
  DualVideoAnalytics,
  SupportTicket,
  SupportChatMessage,
  BannedDeviceRecord,
  UserDeviceSession,
  DeviceActivityItem,
} from './src/types/mito';

dotenv.config();

const PORT = 3000;
const PEPPER = 'mito-heritage-default-server-pepper-2026';
const SESSION_SECRET = 'mito-session-signing-secret-2026';
const COOKIE_NAME = 'mito_session';
const DEFAULT_ADMIN_CODE_DIGITS = '111222333';
const DEFAULT_ADMIN_CODE_FORMATTED = '111-222-333';

// Rate limiting & lockout memory tracker for login attempts
interface LoginAttemptTracker {
  failures: number;
  lockedUntilMs: number;
  lastAttemptMs: number;
}
const loginAttemptsByIp = new Map<string, LoginAttemptTracker>();
const loginAttemptsByCodePrefix = new Map<string, LoginAttemptTracker>();

// Active solo quiz sessions in server memory
interface SoloQuizSession {
  sessionId: string;
  userId: string;
  gameId: string;
  startedAtMs: number;
  currentQuestionIndex: number;
  questionStartedAtMs: number;
  answeredQuestionIndices: Set<number>;
  score: number;
  correctCount: number;
  streak: number;
  bestStreak: number;
  completed: boolean;
}
const soloQuizSessions = new Map<string, SoloQuizSession>();

function signToken(payload: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySignedToken(signed: string | undefined): string | null {
  if (!signed || !signed.includes('.')) return null;
  const lastDot = signed.lastIndexOf('.');
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return payload;
  } catch {
    return null;
  }
}

const SERVER_BOOT_BUILD_ID = `mito_build_${Date.now()}`;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function extractRawTokenFromRequest(req: Request): string | undefined {
  const headerMito = req.headers['x-mito-session'];
  if (typeof headerMito === 'string' && headerMito.trim().length > 0) {
    return headerMito.trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) return token;
  }
  if (typeof req.query?.token === 'string' && req.query.token.trim().length > 0) {
    return req.query.token.trim();
  }
  const rawCookie = req.cookies?.[COOKIE_NAME] || req.cookies?.mito_client_token;
  if (typeof rawCookie === 'string' && rawCookie.trim().length > 0) {
    return rawCookie.trim();
  }
  return undefined;
}

function buildSignedSessionToken(sessionId: string, userId: string, deviceId: string): string {
  return signToken(`${sessionId}|${userId}|${deviceId}`);
}

function parseVerifiedSessionToken(rawToken: string | undefined): {
  sessionId: string;
  tokenUserId?: string;
  tokenDeviceId?: string;
} | null {
  const verifiedPayload = verifySignedToken(rawToken);
  if (!verifiedPayload) return null;
  const parts = verifiedPayload.split('|');
  const sessionId = (parts[0] || '').trim();
  if (!sessionId) return null;
  return {
    sessionId,
    tokenUserId: parts[1] ? parts[1].trim() : undefined,
    tokenDeviceId: parts[2] ? parts[2].trim() : undefined,
  };
}

function ensureSuperAdminAccount(displayName = 'Super Admin MITO'): UserAccount {
  const db = store.getState();
  let adminUser = db.users.find((u) => u.role === 'super_admin');
  if (!adminUser) {
    const salt = 'mito_super_admin_salt_v1';
    const hash = hashAccessCode(DEFAULT_ADMIN_CODE_DIGITS, salt, PEPPER);
    const nowIso = new Date().toISOString();
    adminUser = {
      uid: 'admin_mito_primary',
      codeHash: hash,
      codeSalt: salt,
      maskedCode: '***-***-333',
      fullCode: DEFAULT_ADMIN_CODE_FORMATTED,
      role: 'super_admin',
      status: 'active',
      displayName,
      avatar: 'fortress',
      createdAt: nowIso,
      firstLoginAt: nowIso,
      accessActivatedAt: nowIso,
      lastLoginAt: nowIso,
      accessPolicy: createAccessPolicyPreset('full'),
      stats: {
        totalXp: 0,
        totalPoints: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        correctAnswers: 0,
        totalAnswers: 0,
        accuracyPercent: 0,
        currentStreak: 0,
        bestStreak: 0,
        rank: 1,
        country: 'Shqipëri',
        watchedSecondsToday: 0,
        gameSessionsToday: 0,
        lastActivityDate: nowIso.slice(0, 10),
      },
      achievements: [],
      likedShortIds: [],
      savedContentIds: [],
      recentActivity: [],
    };
    db.users.push(adminUser);
    store.commit();
  } else if (!adminUser.fullCode) {
    adminUser.fullCode = DEFAULT_ADMIN_CODE_FORMATTED;
  }
  return adminUser;
}

function parseDeviceLabel(userAgent: string): string {
  const ua = (userAgent || '').toLowerCase();
  let os = 'Pajisje Web';
  if (ua.includes('iphone')) os = 'iPhone (iOS)';
  else if (ua.includes('ipad')) os = 'iPad (iPadOS)';
  else if (ua.includes('android')) os = 'Telefon Android';
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'Mac / MacBook';
  else if (ua.includes('windows')) os = 'Windows PC';
  else if (ua.includes('linux')) os = 'Linux Desktop';

  let browser = 'Shfletues';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
  else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
  else if (ua.includes('firefox/')) browser = 'Firefox';

  return `${os} · ${browser}`;
}

function extractDeviceIdFromRequest(req: Request): string {
  const headerDev = req.headers['x-mito-device-id'];
  if (typeof headerDev === 'string' && headerDev.trim().length >= 4) {
    return headerDev.trim().slice(0, 80);
  }
  const ua = String(req.headers['user-agent'] || 'unknown');
  const ip = req.ip || 'unknown';
  const hash = crypto.createHash('sha1').update(`${ip}::${ua}`).digest('hex').slice(0, 12);
  return `dev_${hash}`;
}

function isDeviceBannedForUser(deviceId: string, userId?: string): boolean {
  const db = store.getState();
  if (!Array.isArray(db.bannedDevices) || db.bannedDevices.length === 0) return false;
  return db.bannedDevices.some(
    (b) => b.deviceId === deviceId && (!b.userId || !userId || b.userId === userId)
  );
}

function formatTimeOfDaySq(isoStr?: string): string {
  const d = isoStr ? new Date(isoStr) : new Date();
  return d.toLocaleTimeString('sq-AL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function appendSessionActivity(
  req: AuthenticatedRequest,
  type: 'watch' | 'short' | 'game' | 'login' | 'support',
  title: string,
  detail?: string
) {
  const db = store.getState();
  const sessionId = req.sessionId;
  if (!sessionId) return;
  const session = db.activeSessions.find((s) => s.sessionId === sessionId);
  if (!session) return;
  if (!Array.isArray(session.activityLog)) {
    session.activityLog = [];
  }
  const nowIso = new Date().toISOString();
  const timeOfDay = formatTimeOfDaySq(nowIso);

  // If the most recent activity on this session is for the same title and type within the last 10 minutes, update it in place
  const latest = session.activityLog[0];
  if (
    latest &&
    latest.type === type &&
    latest.title === title &&
    Date.now() - new Date(latest.timestamp).getTime() < 10 * 60_000
  ) {
    latest.timestamp = nowIso;
    latest.timeOfDay = timeOfDay;
    if (detail) latest.detail = detail;
    return;
  }

  session.activityLog.unshift({
    id: `dact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    detail,
    timestamp: nowIso,
    timeOfDay,
  });
  if (session.activityLog.length > 50) {
    session.activityLog = session.activityLog.slice(0, 50);
  }
}

function createSessionForUser(req: Request, res: Response, user: UserAccount): string {
  const db = store.getState();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const sessionExpiresMs = nowMs + ONE_YEAR_MS;
  const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 200);
  const deviceId = extractDeviceIdFromRequest(req);
  const deviceLabel = parseDeviceLabel(ua);

  // Reuse an existing non-revoked session for the same user + deviceId if present
  const existingSession = db.activeSessions.find(
    (s) => s.userId === user.uid && s.deviceId === deviceId && !s.revoked
  );

  let sessionId: string;
  if (existingSession) {
    sessionId = existingSession.sessionId;
    existingSession.lastSeenAt = nowIso;
    existingSession.expiresAt = new Date(sessionExpiresMs).toISOString();
    existingSession.deviceLabel = deviceLabel;
    existingSession.userAgent = ua;
    existingSession.ipAddress = req.ip || existingSession.ipAddress || 'unknown';
  } else {
    sessionId = `sess_${crypto.randomBytes(16).toString('hex')}`;
    db.activeSessions.push({
      sessionId,
      userId: user.uid,
      deviceId,
      deviceLabel,
      userAgent: ua,
      ipAddress: req.ip || 'unknown',
      createdAt: nowIso,
      expiresAt: new Date(sessionExpiresMs).toISOString(),
      lastSeenAt: nowIso,
      revoked: false,
      activityLog: [
        {
          id: `dact_${nowMs}`,
          type: 'login',
          title: 'Hyrje në llogari',
          detail: deviceLabel,
          timestamp: nowIso,
          timeOfDay: formatTimeOfDaySq(nowIso),
        },
      ],
    });
  }
  store.commit();

  const signedToken = buildSignedSessionToken(sessionId, user.uid, deviceId);
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

  res.cookie(COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: ONE_YEAR_MS,
    path: '/',
  });

  return signedToken;
}

function sanitizeUser(user: UserAccount) {
  const { codeHash: _ch, codeSalt: _cs, ...safeUser } = user;
  const accessEvaluation = evaluateAccountTimeAccess(user);
  return {
    ...safeUser,
    fullCode: user.fullCode || user.maskedCode,
    accessEvaluation,
  };
}

function syncLeaderboardForUser(user: UserAccount) {
  if (user.role === 'super_admin') return;
  const db = store.getState();
  let entry = db.leaderboardEntries.find((e) => e.userId === user.uid);
  if (!entry) {
    entry = {
      entryId: `lb_${user.uid}`,
      userId: user.uid,
      displayName: user.displayName,
      avatar: user.avatar,
      maskedCode: user.maskedCode,
      totalXp: user.stats.totalXp,
      totalPoints: user.stats.totalPoints,
      gamesPlayed: user.stats.gamesPlayed,
      gamesWon: user.stats.gamesWon,
      accuracyPercent: user.stats.accuracyPercent,
      currentStreak: user.stats.currentStreak,
      country: user.stats.country || 'Shqipëri',
      school: user.stats.school || '',
      weeklyPoints: user.stats.totalPoints,
      monthlyPoints: user.stats.totalPoints,
      updatedAt: new Date().toISOString(),
    };
    db.leaderboardEntries.push(entry);
  } else {
    entry.displayName = user.displayName;
    entry.avatar = user.avatar;
    entry.totalXp = user.stats.totalXp;
    entry.totalPoints = user.stats.totalPoints;
    entry.gamesPlayed = user.stats.gamesPlayed;
    entry.gamesWon = user.stats.gamesWon;
    entry.accuracyPercent = user.stats.accuracyPercent;
    entry.currentStreak = user.stats.currentStreak;
    entry.country = user.stats.country || 'Shqipëri';
    entry.school = user.stats.school || '';
    entry.weeklyPoints = user.stats.totalPoints;
    entry.monthlyPoints = user.stats.totalPoints;
    entry.updatedAt = new Date().toISOString();
  }

  const sorted = sortLeaderboardEntries(db.leaderboardEntries, 'global');
  sorted.forEach((item, idx) => {
    const u = db.users.find((usr) => usr.uid === item.userId);
    if (u) u.stats.rank = idx + 1;
  });
}

interface AuthenticatedRequest extends Request {
  user?: UserAccount;
  sessionId?: string;
  explicitlyRevoked?: boolean;
}

function resolveUserFromRequest(req: AuthenticatedRequest): UserAccount | null {
  const db = store.getState();
  const rawToken = extractRawTokenFromRequest(req);
  const parsedToken = parseVerifiedSessionToken(rawToken);
  const reqDeviceId = extractDeviceIdFromRequest(req);
  const deletedSet = new Set(db.deletedIds || []);

  const headerUidRaw = req.headers['x-mito-user-uid'] || req.cookies?.mito_client_uid;
  const headerUid = typeof headerUidRaw === 'string' && headerUidRaw.trim() ? headerUidRaw.trim() : undefined;

  const headerCodeRaw = req.headers['x-mito-saved-code'] || req.cookies?.mito_client_code;
  const headerCodeDigits =
    typeof headerCodeRaw === 'string' && headerCodeRaw.trim()
      ? normalizeAccessCode(headerCodeRaw.trim())
      : null;

  // 1. If we have a cryptographically verified session token
  if (parsedToken) {
    const { sessionId, tokenUserId, tokenDeviceId } = parsedToken;
    const effectiveDeviceId = tokenDeviceId || reqDeviceId;

    // Was this session explicitly kicked/revoked by Admin, MITO, or user logout?
    if (deletedSet.has(sessionId)) {
      req.explicitlyRevoked = true;
      return null;
    }

    const existingRecord = db.activeSessions.find((s) => s.sessionId === sessionId);
    if (existingRecord && existingRecord.revoked) {
      req.explicitlyRevoked = true;
      return null;
    }

    if (existingRecord && !existingRecord.revoked) {
      const user = db.users.find((u) => u.uid === existingRecord.userId);
      if (user) {
        if (user.status === 'suspended' || user.status === 'revoked') {
          req.explicitlyRevoked = true;
          return null;
        }
        if (
          user.role !== 'super_admin' &&
          (isDeviceBannedForUser(existingRecord.deviceId || effectiveDeviceId, user.uid) ||
            isDeviceBannedForUser(reqDeviceId, user.uid))
        ) {
          existingRecord.revoked = true;
          store.markDeleted(existingRecord.sessionId);
          store.commit();
          req.explicitlyRevoked = true;
          return null;
        }
        if (!existingRecord.deviceId) existingRecord.deviceId = reqDeviceId;
        if (!existingRecord.deviceLabel) {
          existingRecord.deviceLabel = parseDeviceLabel(
            existingRecord.userAgent || String(req.headers['user-agent'] || '')
          );
        }
        if (!Array.isArray(existingRecord.activityLog)) {
          existingRecord.activityLog = [];
        }
        const nowMs = Date.now();
        existingRecord.lastSeenAt = new Date(nowMs).toISOString();
        existingRecord.expiresAt = new Date(nowMs + ONE_YEAR_MS).toISOString();
        req.user = user;
        req.sessionId = sessionId;
        return user;
      }
    }

    // Self-Heal: Validly signed token whose session record was not yet in db.activeSessions after an app update/restart
    const candidateUid = tokenUserId || headerUid;
    let candidateUser = candidateUid ? db.users.find((u) => u.uid === candidateUid) : undefined;
    if (!candidateUser && headerCodeDigits) {
      candidateUser = db.users.find(
        (u) => u.fullCode && normalizeAccessCode(u.fullCode) === headerCodeDigits
      );
    }

    if (candidateUser && candidateUser.status !== 'suspended' && candidateUser.status !== 'revoked') {
      if (
        candidateUser.role !== 'super_admin' &&
        (isDeviceBannedForUser(effectiveDeviceId, candidateUser.uid) ||
          isDeviceBannedForUser(reqDeviceId, candidateUser.uid))
      ) {
        req.explicitlyRevoked = true;
        return null;
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 200);
      const deviceLabel = parseDeviceLabel(ua);
      db.activeSessions.push({
        sessionId,
        userId: candidateUser.uid,
        deviceId: reqDeviceId,
        deviceLabel,
        userAgent: ua,
        ipAddress: req.ip || 'unknown',
        createdAt: nowIso,
        expiresAt: new Date(nowMs + ONE_YEAR_MS).toISOString(),
        lastSeenAt: nowIso,
        revoked: false,
        activityLog: [
          {
            id: `dact_${nowMs}`,
            type: 'login',
            title: 'Sesion i vazhduar automatikisht',
            detail: deviceLabel,
            timestamp: nowIso,
            timeOfDay: formatTimeOfDaySq(nowIso),
          },
        ],
      });
      store.commit();
      req.user = candidateUser;
      req.sessionId = sessionId;
      return candidateUser;
    }
  }

  // 2. Fallback self-heal via matching active device session or saved code header (when not explicitly revoked/banned)
  if (headerUid || headerCodeDigits) {
    let matchedUser = headerUid ? db.users.find((u) => u.uid === headerUid) : undefined;
    if (!matchedUser && headerCodeDigits) {
      matchedUser = db.users.find(
        (u) => u.fullCode && normalizeAccessCode(u.fullCode) === headerCodeDigits
      );
    }

    if (matchedUser && matchedUser.status !== 'suspended' && matchedUser.status !== 'revoked') {
      if (
        matchedUser.role !== 'super_admin' &&
        isDeviceBannedForUser(reqDeviceId, matchedUser.uid)
      ) {
        req.explicitlyRevoked = true;
        return null;
      }

      // Check if this device was explicitly kicked for this user
      const deviceSessions = db.activeSessions.filter(
        (s) => s.userId === matchedUser!.uid && s.deviceId === reqDeviceId
      );
      const activeDeviceSession = deviceSessions.find((s) => !s.revoked && !deletedSet.has(s.sessionId));
      const wasExplicitlyKicked =
        deviceSessions.length > 0 &&
        !activeDeviceSession &&
        deviceSessions.every((s) => s.revoked || deletedSet.has(s.sessionId));

      if (wasExplicitlyKicked) {
        req.explicitlyRevoked = true;
        return null;
      }

      if (activeDeviceSession) {
        const nowMs = Date.now();
        activeDeviceSession.lastSeenAt = new Date(nowMs).toISOString();
        activeDeviceSession.expiresAt = new Date(nowMs + ONE_YEAR_MS).toISOString();
        req.user = matchedUser;
        req.sessionId = activeDeviceSession.sessionId;
        return matchedUser;
      }

      if (headerCodeDigits) {
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 200);
        const deviceLabel = parseDeviceLabel(ua);
        const newSessionId = `sess_${crypto.randomBytes(16).toString('hex')}`;
        db.activeSessions.push({
          sessionId: newSessionId,
          userId: matchedUser.uid,
          deviceId: reqDeviceId,
          deviceLabel,
          userAgent: ua,
          ipAddress: req.ip || 'unknown',
          createdAt: nowIso,
          expiresAt: new Date(nowMs + ONE_YEAR_MS).toISOString(),
          lastSeenAt: nowIso,
          revoked: false,
          activityLog: [
            {
              id: `dact_${nowMs}`,
              type: 'login',
              title: 'Sesion i vazhduar automatikisht',
              detail: deviceLabel,
              timestamp: nowIso,
              timeOfDay: formatTimeOfDaySq(nowIso),
            },
          ],
        });
        store.commit();
        req.user = matchedUser;
        req.sessionId = newSessionId;
        return matchedUser;
      }
    }
  }

  return null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const reqDeviceId = extractDeviceIdFromRequest(req);
  const user = resolveUserFromRequest(req);
  if (!user) {
    if (isDeviceBannedForUser(reqDeviceId)) {
      res.status(403).json({
        error: 'Kjo pajisje është bllokuar nga administratori dhe nuk lejohet të hyjë në platformë.',
        code: 'DEVICE_BANNED',
      });
      return;
    }
    res.status(401).json({
      error: 'Ju lutem hyni me kodin tuaj 9-shifror.',
      code: 'UNAUTHENTICATED',
    });
    return;
  }

  const timeEval = evaluateAccountTimeAccess(user);
  if (!timeEval.allowed && user.role !== 'super_admin') {
    if (timeEval.reasonCode === 'expired' && user.status === 'active') {
      user.status = 'expired';
    }
    store.commit();
    res.status(403).json({
      error: timeEval.messageSq || 'Sesioni yt ka përfunduar.',
      code: timeEval.reasonCode || 'ACCESS_EXPIRED',
    });
    return;
  }

  req.user = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = resolveUserFromRequest(req);
  if (user && user.role === 'super_admin') {
    req.user = user;
    next();
    return;
  }
  res.status(403).json({
    error: 'Akses i kufizuar vetëm për Super Administratorin.',
    code: 'FORBIDDEN',
  });
}

function synthesizePlayableMp4OnDisk(
  targetDiskPath: string,
  width: number,
  height: number,
  durationSeconds = 15,
  posterSource?: string
): boolean {
  const safeW = Math.max(320, Math.min(1920, Math.floor(width / 2) * 2));
  const safeH = Math.max(320, Math.min(1920, Math.floor(height / 2) * 2));
  const clipDur = Math.max(5, Math.min(30, durationSeconds || 15));
  const defaultImg = path.join(
    process.cwd(),
    'public/assets/aistudio/BesaCover_3b623702.jpg'
  );

  let tempImgPath: string | null = null;
  let imageInputPath = fs.existsSync(defaultImg)
    ? defaultImg
    : path.join(
        process.cwd(),
        'public/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png'
      );

  try {
    if (posterSource && posterSource.startsWith('data:image/')) {
      const commaIdx = posterSource.indexOf(',');
      if (commaIdx > 0) {
        const b64 = posterSource.slice(commaIdx + 1);
        tempImgPath = path.join(UPLOADS_DIR, `tmp_poster_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`);
        fs.writeFileSync(tempImgPath, Buffer.from(b64, 'base64'));
        imageInputPath = tempImgPath;
      }
    } else if (posterSource && posterSource.startsWith('/assets/')) {
      const candidate = path.join(process.cwd(), 'public', posterSource);
      if (fs.existsSync(candidate)) {
        imageInputPath = candidate;
      }
    }

    const outTmp = `${targetDiskPath}.synth_${Date.now()}.mp4`;
    const args: string[] = [
      '-y',
      '-loop',
      '1',
      '-i',
      imageInputPath,
      '-f',
      'lavfi',
      '-t',
      String(clipDur),
      '-i',
      "aevalsrc='0.12*sin(2*PI*110*t)+0.08*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)':s=44100:c=stereo",
      '-t',
      String(clipDur),
      '-vf',
      `scale=${safeW}:${safeH}:force_original_aspect_ratio=decrease,pad=${safeW}:${safeH}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '25',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-movflags',
      '+faststart',
      outTmp,
    ];

    execFileSync('/usr/bin/ffmpeg', args, { stdio: 'ignore', timeout: 15000 });
    if (fs.existsSync(outTmp) && fs.statSync(outTmp).size > 2048) {
      fs.renameSync(outTmp, targetDiskPath);
      return true;
    }
  } catch (err) {
    console.error('Error synthesizing playable MP4 with ffmpeg:', err);
  } finally {
    if (tempImgPath && fs.existsSync(tempImgPath)) {
      try {
        fs.unlinkSync(tempImgPath);
      } catch {
        // Ignore
      }
    }
  }
  return false;
}

function inspectAndOptimizeUploadedVideo(
  diskPath: string,
  assetId: string,
  expectedFormat?: string
): {
  width: number;
  height: number;
  aspectRatio: number;
  resolution: string;
  durationSeconds: number;
  codec: string;
  audioCodec: string;
  needsVerticalAspectWarning: boolean;
  autoThumbnailUrl?: string;
} {
  const stat = fs.statSync(diskPath);
  let width = 0;
  let height = 0;
  let durationSeconds = 0;
  let codec = 'H.264 (avc1)';
  let audioCodec = 'AAC (mp4a)';
  let rawVideoCodecName = 'h264';
  let autoThumbnailUrl: string | undefined;

  try {
    const probeOut = execFileSync(
      '/usr/bin/ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height',
        '-of',
        'json',
        diskPath,
      ],
      { encoding: 'utf-8', timeout: 10000 }
    );
    const probeJson = JSON.parse(probeOut);
    if (probeJson.format?.duration) {
      const d = parseFloat(probeJson.format.duration);
      if (Number.isFinite(d) && d > 0) {
        durationSeconds = Math.max(1, Math.round(d));
      }
    }
    if (Array.isArray(probeJson.streams)) {
      for (const st of probeJson.streams) {
        if (st.codec_type === 'video' && width === 0) {
          width = Number(st.width || 0);
          height = Number(st.height || 0);
          rawVideoCodecName = String(st.codec_name || 'h264').toLowerCase();
          if (rawVideoCodecName === 'h264') codec = 'H.264 (avc1)';
          else if (rawVideoCodecName === 'hevc' || rawVideoCodecName === 'h265') codec = 'HEVC (hvc1)';
          else if (rawVideoCodecName === 'vp9') codec = 'VP9 (vp09)';
          else if (rawVideoCodecName === 'av1') codec = 'AV1 (av01)';
          else codec = rawVideoCodecName.toUpperCase();
        } else if (st.codec_type === 'audio') {
          const ac = String(st.codec_name || 'aac').toLowerCase();
          if (ac === 'aac') audioCodec = 'AAC (mp4a)';
          else audioCodec = ac.toUpperCase();
        }
      }
    }
  } catch {
    // Fallback to binary box parser if ffprobe fails
    const fd = fs.openSync(diskPath, 'r');
    const readLen = Math.min(stat.size, 2 * 1024 * 1024);
    const headBuf = Buffer.alloc(readLen);
    fs.readSync(fd, headBuf, 0, readLen, 0);
    fs.closeSync(fd);
    const fallback = parseMp4Buffer(headBuf);
    width = fallback.width;
    height = fallback.height;
    durationSeconds = fallback.durationSeconds;
    codec = fallback.codec;
    audioCodec = fallback.audioCodec;
  }

  if (width <= 0 || height <= 0) {
    width = expectedFormat === 'short' ? 1080 : 1920;
    height = expectedFormat === 'short' ? 1920 : 1080;
  }
  if (durationSeconds <= 0) {
    durationSeconds = expectedFormat === 'short' ? 45 : 120;
  }

  // Extract a real frame thumbnail from the uploaded video if it has real frames
  if (stat.size > 2048) {
    const thumbTmp = `${diskPath}.thumb_${Date.now()}.jpg`;
    try {
      const seekSec = Math.min(1.5, Math.max(0.1, durationSeconds * 0.15));
      execFileSync(
        '/usr/bin/ffmpeg',
        [
          '-y',
          '-ss',
          seekSec.toFixed(2),
          '-i',
          diskPath,
          '-frames:v',
          '1',
          '-vf',
          'scale=640:-1',
          '-q:v',
          '6',
          thumbTmp,
        ],
        { stdio: 'ignore', timeout: 8000 }
      );
      if (fs.existsSync(thumbTmp) && fs.statSync(thumbTmp).size > 200) {
        const jpgBuf = fs.readFileSync(thumbTmp);
        autoThumbnailUrl = `data:image/jpeg;base64,${jpgBuf.toString('base64')}`;
      }
    } catch {
      // Ignore thumbnail extraction error
    } finally {
      if (fs.existsSync(thumbTmp)) {
        try {
          fs.unlinkSync(thumbTmp);
        } catch {
          // Ignore
        }
      }
    }

    // Ensure browser-ready H.264 + AAC with -movflags +faststart
    const fastTmp = `${diskPath}.fast_${Date.now()}.mp4`;
    try {
      if (rawVideoCodecName === 'h264') {
        execFileSync(
          '/usr/bin/ffmpeg',
          ['-y', '-i', diskPath, '-c', 'copy', '-movflags', '+faststart', fastTmp],
          { stdio: 'ignore', timeout: 15000 }
        );
      } else {
        // Transcode non-H.264 (e.g. iPhone HEVC .mov) to H.264/AAC MP4 so all browsers can play it
        execFileSync(
          '/usr/bin/ffmpeg',
          [
            '-y',
            '-i',
            diskPath,
            '-vf',
            "scale='min(1280,iw)':-2,format=yuv420p",
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '26',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            fastTmp,
          ],
          { stdio: 'ignore', timeout: 45000 }
        );
        codec = 'H.264 (avc1)';
        audioCodec = 'AAC (mp4a)';
      }
      if (fs.existsSync(fastTmp) && fs.statSync(fastTmp).size > 1024) {
        fs.renameSync(fastTmp, diskPath);
      }
    } catch {
      if (fs.existsSync(fastTmp)) {
        try {
          fs.unlinkSync(fastTmp);
        } catch {
          // Ignore
        }
      }
    }

    // Persist video binary to Firestore chunks so it survives app updates, restarts & multi-instance scaling
    const currentSize = fs.statSync(diskPath).size;
    if (currentSize <= 14 * 1024 * 1024) {
      store.saveMediaFileToCloud(assetId, diskPath).catch(() => {});
    } else {
      // For very large files (>14MB, e.g. 128MB), create a compact cloud stream backup in background
      const cloudStreamTmp = `${diskPath}.cloud_${Date.now()}.mp4`;
      execFile(
        '/usr/bin/ffmpeg',
        [
          '-y',
          '-i',
          diskPath,
          '-t',
          '240',
          '-vf',
          "scale='min(854,iw)':-2,format=yuv420p",
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '30',
          '-maxrate',
          '800k',
          '-bufsize',
          '1600k',
          '-c:a',
          'aac',
          '-b:a',
          '96k',
          '-movflags',
          '+faststart',
          cloudStreamTmp,
        ],
        { timeout: 90000 },
        (err) => {
          if (!err && fs.existsSync(cloudStreamTmp) && fs.statSync(cloudStreamTmp).size > 1024) {
            store
              .saveMediaFileToCloud(assetId, cloudStreamTmp)
              .catch(() => {})
              .finally(() => {
                try {
                  fs.unlinkSync(cloudStreamTmp);
                } catch {
                  // Ignore
                }
              });
          } else if (fs.existsSync(cloudStreamTmp)) {
            try {
              fs.unlinkSync(cloudStreamTmp);
            } catch {
              // Ignore
            }
          }
        }
      );
    }
  }

  const aspectRatio = Number((width / height).toFixed(4));
  const resolution = `${width}x${height}`;
  const isVertical916 = Math.abs(aspectRatio - 9 / 16) <= 0.035;

  return {
    width,
    height,
    aspectRatio,
    resolution,
    durationSeconds,
    codec,
    audioCodec,
    needsVerticalAspectWarning: !isVertical916,
    autoThumbnailUrl,
  };
}

async function ensurePlayableVideoOnDisk(
  asset: MediaAsset,
  relatedContent?: VideoContent
): Promise<string | null> {
  const diskPath = path.join(UPLOADS_DIR, path.basename(asset.storagePath));
  const isBesaVideo =
    asset.assetId === 'media_1793701333969_28662594' ||
    relatedContent?.contentId === 'cnt_1793701774719_0bebb6e7' ||
    Boolean(relatedContent?.title?.toLowerCase().includes('besa')) ||
    Boolean(asset.filename?.toLowerCase().includes('besa'));

  const attachedBesaFullFilm = path.join(
    process.cwd(),
    'public/assets/aistudio/BESA_Short_Film_Higgsfield_Global_Film_Festival_Nominee_-_OLL_KORRECT__824p__9574e991.mp4'
  );

  // Always prefer the attached BESA Short Film when available
  if (isBesaVideo && fs.existsSync(attachedBesaFullFilm)) {
    asset.fileSizeBytes = fs.statSync(attachedBesaFullFilm).size;
    asset.durationSeconds = 631;
    return attachedBesaFullFilm;
  }

  // If this is a Google Drive video and we have a Drive OAuth token, try downloading the exact file from Drive if not yet downloaded
  const db = store.getState();
  const driveFileId = asset.driveFileId || relatedContent?.driveVideoFileId;
  const driveToken = db.siteSettings.googleDriveAccessToken;
  if (
    driveFileId &&
    driveToken &&
    (!fs.existsSync(diskPath) || fs.statSync(diskPath).size < 2_500_000)
  ) {
    try {
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${driveToken}` } }
      );
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        if (ab.byteLength > 10_000) {
          fs.writeFileSync(diskPath, Buffer.from(ab));
          asset.fileSizeBytes = ab.byteLength;
          store.saveMediaFileToCloud(asset.assetId, diskPath).catch(() => {});
          return diskPath;
        }
      }
    } catch {
      // Fall through to bundled / cloud chunks
    }
  }

  if (fs.existsSync(diskPath) && fs.statSync(diskPath).size > 2048) {
    return diskPath;
  }

  // 1. Try restoring from Firestore cloud binary chunks
  const restored = await store.restoreMediaFileFromCloud(
    asset.assetId,
    diskPath,
    asset.cloudChunkCount
  );
  if (restored && fs.existsSync(diskPath) && fs.statSync(diskPath).size > 2048) {
    return diskPath;
  }

  if (isBesaVideo && fs.existsSync(attachedBesaFullFilm)) {
    return attachedBesaFullFilm;
  }

  // 2. Fallback for legacy/starter videos whose binary was created before cloud chunk storage:
  // synthesize a real playable H.264 + AAC MP4 using the content's thumbnail/poster + harmonic audio
  const w = asset.width || relatedContent?.width || (asset.videoFormat === 'short' ? 1080 : 1920);
  const h = asset.height || relatedContent?.height || (asset.videoFormat === 'short' ? 1920 : 1080);
  const dur = asset.durationSeconds || relatedContent?.durationSeconds || 15;
  const poster =
    relatedContent?.thumbnailUrl ||
    relatedContent?.posterUrl ||
    asset.autoThumbnailUrl ||
    '/assets/aistudio/BesaCover_3b623702.jpg';

  const synthesized = synthesizePlayableMp4OnDisk(diskPath, w, h, dur, poster);
  if (synthesized && fs.existsSync(diskPath)) {
    asset.fileSizeBytes = fs.statSync(diskPath).size;
    store.saveMediaFileToCloud(asset.assetId, diskPath).catch(() => {});
    return diskPath;
  }

  return fs.existsSync(diskPath) ? diskPath : null;
}

function streamVideoFileWithRange(req: Request, res: Response, diskPath: string, mimeType = 'video/mp4') {
  const stat = fs.statSync(diskPath);
  const range = req.headers.range;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Math.max(0, parseInt(parts[0], 10) || 0);
    const end = parts[1] ? Math.min(stat.size - 1, parseInt(parts[1], 10)) : stat.size - 1;
    if (start >= stat.size || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${stat.size}`,
      });
      res.end();
      return;
    }
    const chunksize = end - start + 1;
    const file = fs.createReadStream(diskPath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType || 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mimeType || 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(diskPath).pipe(res);
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // Automatically keep state synchronized with Firestore across updates, restarts, and instances
  app.use('/api', async (req, _res, next) => {
    if (!req.path.startsWith('/admin/media/upload-chunk/')) {
      await store.syncFromCloud();
    }
    next();
  });

  // =========================================================
  // 1. AUTHENTICATION & SINGLE SUPER ADMIN BOOTSTRAP
  // =========================================================

  app.get('/api/app-version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ buildId: SERVER_BOOT_BUILD_ID });
  });

  app.get('/api/auth/bootstrap-status', (_req, res) => {
    const db = store.getState();
    const superAdminExists = db.users.some((u) => u.role === 'super_admin');
    res.json({
      superAdminExists,
      requiresSecret: false,
      platformName: db.siteSettings.platformName,
      buildId: SERVER_BOOT_BUILD_ID,
    });
  });

  app.post('/api/auth/bootstrap', (req, res) => {
    const displayName = (req.body?.displayName || 'Super Admin MITO').trim().slice(0, 80);
    const adminUser = ensureSuperAdminAccount(displayName);
    adminUser.displayName = displayName;
    const sessionToken = createSessionForUser(req, res, adminUser);

    store.addAuditLog({
      actorUid: adminUser.uid,
      actorRole: 'super_admin',
      action: 'SUPER_ADMIN_BOOTSTRAPPED',
      ipAddress: req.ip,
      details: `Llogaria e vetme Super Admin (${adminUser.displayName}) u inicializua me sukses.`,
      severity: 'info',
    });
    store.commit();

    res.status(201).json({
      user: sanitizeUser(adminUser),
      sessionToken,
      maskedCode: adminUser.maskedCode,
      displayName: adminUser.displayName,
      redirectTo: '/admin',
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || 'unknown';
    const rawCode = String(req.body?.code || '');
    const digits = normalizeAccessCode(rawCode);
    const nowMs = Date.now();

    if (!digits) {
      res.status(400).json({
        error: 'Ju lutem vendosni një kod të vlefshëm 9-shifror në formatin XXX-XXX-XXX.',
        code: 'INVALID_FORMAT',
      });
      return;
    }

    // Sync latest users/state from Firestore cloud so codes generated on ais-dev work immediately on ais-pre
    await store.syncFromCloud(true);

    // Ensure Super Admin exists so 111-222-333 always works
    ensureSuperAdminAccount();

    const db = store.getState();
    let matchedUser: UserAccount | undefined;

    if (digits === DEFAULT_ADMIN_CODE_DIGITS) {
      matchedUser = db.users.find((u) => u.role === 'super_admin');
    }

    if (!matchedUser) {
      for (const candidate of db.users) {
        const candidateDigits = candidate.fullCode ? normalizeAccessCode(candidate.fullCode) : null;
        if (
          (candidateDigits && candidateDigits === digits) ||
          verifyAccessCode(digits, candidate.codeSalt, candidate.codeHash, PEPPER)
        ) {
          matchedUser = candidate;
          break;
        }
      }
    }

    // Fallback: if the 9-digit code has a valid Admin HMAC checksum (e.g. generated on another instance),
    // automatically provision/restore the UserAccount so the user can always log in without error
    if (!matchedUser) {
      const checksumCheck = verifyGeneratedCodeChecksum(digits, PEPPER);
      if (checksumCheck.valid) {
        const formattedCode = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashAccessCode(digits, salt, PEPPER);
        const nowIso = new Date(nowMs).toISOString();
        const autoUser: UserAccount = {
          uid: `usr_${digits}`,
          codeHash: hash,
          codeSalt: salt,
          maskedCode: maskAccessCode(digits),
          fullCode: formattedCode,
          role: 'user',
          status: 'active',
          displayName: `Vizitor MITO (${formattedCode})`,
          avatar: 'eagle',
          createdAt: nowIso,
          firstLoginAt: nowIso,
          accessActivatedAt: nowIso,
          lastLoginAt: nowIso,
          accessPolicy: createAccessPolicyPreset(checksumCheck.preset),
          stats: {
            totalXp: 0,
            totalPoints: 0,
            gamesPlayed: 0,
            gamesWon: 0,
            correctAnswers: 0,
            totalAnswers: 0,
            accuracyPercent: 0,
            currentStreak: 0,
            bestStreak: 0,
            rank: db.users.length,
            country: 'Shqipëri',
            school: '',
            watchedSecondsToday: 0,
            gameSessionsToday: 0,
            lastActivityDate: nowIso.slice(0, 10),
          },
          achievements: [],
          likedShortIds: [],
          savedContentIds: [],
          recentActivity: [],
        };
        db.users.unshift(autoUser);
        syncLeaderboardForUser(autoUser);
        matchedUser = autoUser;
      }
    }

    if (!matchedUser) {
      res.status(401).json({
        error: 'Kodi i aksesit nuk është i saktë ose nuk është aktiv.',
        code: 'INVALID_CODE',
      });
      return;
    }

    const reqDeviceId = extractDeviceIdFromRequest(req);
    if (matchedUser.role !== 'super_admin' && isDeviceBannedForUser(reqDeviceId, matchedUser.uid)) {
      res.status(403).json({
        error:
          'Kjo pajisje është bllokuar nga administratori dhe nuk lejohet të hyjë në platformë.',
        code: 'DEVICE_BANNED',
      });
      return;
    }

    const nowIso = new Date(nowMs).toISOString();
    if (!matchedUser.firstLoginAt) {
      matchedUser.firstLoginAt = nowIso;
      matchedUser.accessActivatedAt = nowIso;
      if (matchedUser.status === 'not_activated' || matchedUser.status === 'expired') {
        matchedUser.status = 'active';
      }
    }

    // Ensure fullCode is always saved on the matched user
    if (!matchedUser.fullCode || matchedUser.fullCode.includes('*')) {
      matchedUser.fullCode = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
    }

    const accessEval = evaluateAccountTimeAccess(matchedUser, nowMs);
    if (!accessEval.allowed && matchedUser.role !== 'super_admin') {
      if (accessEval.reasonCode === 'expired') {
        matchedUser.status = 'expired';
      }
      store.commit();
      res.status(403).json({
        error: accessEval.messageSq || 'Sesioni yt ka përfunduar.',
        code: accessEval.reasonCode || 'ACCESS_DENIED',
      });
      return;
    }

    matchedUser.lastLoginAt = nowIso;
    matchedUser.recentActivity.unshift({
      id: `act_${Date.now()}`,
      type: 'login',
      title: 'Hyrje në platformën MITO',
      timestamp: nowIso,
    });
    matchedUser.recentActivity = matchedUser.recentActivity.slice(0, 25);

    store.addAuditLog({
      actorUid: matchedUser.uid,
      actorRole: matchedUser.role,
      action: 'LOGIN_SUCCESS',
      ipAddress: ip,
      details: `${matchedUser.displayName} (${matchedUser.fullCode || matchedUser.maskedCode}) hyri në platformë.`,
      severity: 'info',
    });
    store.commit();

    const sessionToken = createSessionForUser(req, res, matchedUser);

    res.json({
      user: sanitizeUser(matchedUser),
      sessionToken,
      redirectTo: matchedUser.role === 'super_admin' ? '/admin' : '/home',
    });
  });

  app.get('/api/auth/session', (req: AuthenticatedRequest, res) => {
    const db = store.getState();
    const superAdminExists = db.users.some((u) => u.role === 'super_admin');
    const user = resolveUserFromRequest(req);

    if (!user) {
      res.json({
        authenticated: false,
        superAdminExists,
        user: null,
        explicitlyRevoked: Boolean(req.explicitlyRevoked),
      });
      return;
    }

    const accessEval = evaluateAccountTimeAccess(user);
    if (!accessEval.allowed && user.role !== 'super_admin') {
      if (accessEval.reasonCode === 'expired') user.status = 'expired';
      store.commit();
      res.clearCookie(COOKIE_NAME);
      res.json({
        authenticated: false,
        superAdminExists,
        user: null,
        expiredReasonSq: accessEval.messageSq,
        explicitlyRevoked: true,
      });
      return;
    }

    const reqDeviceId = extractDeviceIdFromRequest(req);
    const activeToken = req.sessionId
      ? buildSignedSessionToken(req.sessionId, user.uid, reqDeviceId)
      : createSessionForUser(req, res, user);

    res.json({
      authenticated: true,
      superAdminExists,
      sessionToken: activeToken,
      user: sanitizeUser(user),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const db = store.getState();
    const rawToken = extractRawTokenFromRequest(req);
    const parsed = parseVerifiedSessionToken(rawToken);
    if (parsed?.sessionId) {
      store.markDeleted(parsed.sessionId);
      const session = db.activeSessions.find((s) => s.sessionId === parsed.sessionId);
      if (session) {
        session.revoked = true;
      }
    }
    store.commit();
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // =========================================================
  // 2. GOOGLE DRIVE CONTENT INGESTION & IN-PLATFORM MANAGEMENT
  // =========================================================

  function extractDriveFolderId(input: string | undefined): string {
    const raw = String(input || '').trim();
    if (!raw) return DEFAULT_GOOGLE_DRIVE_FOLDER_ID;
    const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (folderMatch) return folderMatch[1];
    const idParamMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (idParamMatch) return idParamMatch[1];
    if (/^[a-zA-Z0-9_-]{15,}$/.test(raw)) return raw;
    return DEFAULT_GOOGLE_DRIVE_FOLDER_ID;
  }

  /**
   * Ensures that:
   * 1. Any legacy platform-uploaded demo videos (e.g., cnt_std_rozafa, cnt_short_rozafa) are removed,
   *    keeping ONLY the Google Drive folder content (such as BESA Short Film and any newly synced Drive videos).
   * 2. No video requires watching a certain percentage to unlock questionnaires (watchToUnlock.enabled = false, requiredCompletionPercent = 0).
   * 3. The BESA questionnaire/quiz exists and is linked to the BESA film so users & admins can see and play the questionnaire immediately.
   */
  function ensureGoogleDriveCatalogState(): boolean {
    const db = store.getState();
    let mutated = false;
    const nowIso = new Date().toISOString();

    if (!db.siteSettings.googleDriveFolderId) {
      db.siteSettings.googleDriveFolderId = DEFAULT_GOOGLE_DRIVE_FOLDER_ID;
      mutated = true;
    }
    if (!db.siteSettings.googleDriveFolderUrl) {
      db.siteSettings.googleDriveFolderUrl = DEFAULT_GOOGLE_DRIVE_FOLDER_URL;
      mutated = true;
    }

    // Keep only the Legjendat category for organizing the BESA film
    const nonLegendCats = db.categories.filter((c) => c.categoryId !== 'cat_legjenda');
    if (nonLegendCats.length > 0) {
      store.markDeleted(nonLegendCats.map((c) => c.categoryId));
      db.categories = db.categories.filter((c) => c.categoryId === 'cat_legjenda');
      mutated = true;
    }
    if (db.categories.length === 0) {
      db.categories.push({
        categoryId: 'cat_legjenda',
        name: 'Legjendat',
        slug: 'legjenda',
        description: 'Filma artistikë dhe legjenda shqiptare, përfshirë filmin BESA.',
        iconName: 'Compass',
        order: 1,
        createdAt: nowIso,
      });
      mutated = true;
    }

    // Remove legacy starter-pack demo videos if present so only Google Drive content remains
    const legacyContentIds = new Set(['cnt_std_rozafa', 'cnt_short_rozafa']);
    const legacyAssetIds = new Set(['media_short_rozafa_9_16', 'media_std_rozafa_16_9']);
    const beforeContentLen = db.content.length;
    db.content = db.content.filter((c) => !legacyContentIds.has(c.contentId));
    if (db.content.length !== beforeContentLen) {
      store.markDeleted(Array.from(legacyContentIds));
      mutated = true;
    }
    const beforeAssetLen = db.mediaAssets.length;
    db.mediaAssets = db.mediaAssets.filter((a) => !legacyAssetIds.has(a.assetId));
    if (db.mediaAssets.length !== beforeAssetLen) {
      store.markDeleted(Array.from(legacyAssetIds));
      mutated = true;
    }

    // Ensure the primary Google Drive film (BESA Short Film) is present and tagged with the user's Google Drive folder
    let besaContent = db.content.find(
      (c) =>
        c.contentId === 'cnt_1793701774719_0bebb6e7' ||
        c.title.toLowerCase().includes('besa')
    );

    const besaCoverUrl = '/assets/aistudio/BesaCover_3b623702.jpg';
    const besaAssetId = 'media_1793701333969_28662594';
    const besaStorageFilename =
      'media_1793701333969_28662594_BESA_Short_Film_Higgsfield_Global_Film_Festival_Nominee___OLL_KORRECT__824p_.mp4';
    const besaFullDuration = 631;
    const attachedBesaPath = path.join(
      process.cwd(),
      'public/assets/aistudio/BESA_Short_Film_Higgsfield_Global_Film_Festival_Nominee_-_OLL_KORRECT__824p__9574e991.mp4'
    );
    const besaFullFileSize = fs.existsSync(attachedBesaPath)
      ? fs.statSync(attachedBesaPath).size
      : 28366848;

    if (!besaContent && db.content.length === 0) {
      store.unmarkDeleted(['cnt_1793701774719_0bebb6e7', besaAssetId]);

      if (!db.mediaAssets.some((a) => a.assetId === besaAssetId)) {
        db.mediaAssets.unshift({
          assetId: besaAssetId,
          filename:
            'BESA_Short_Film_Higgsfield_Global_Film_Festival_Nominee_-_OLL_KORRECT__824p_.mp4',
          mimeType: 'video/mp4',
          fileSizeBytes: besaFullFileSize,
          videoFormat: 'standard',
          width: 1920,
          height: 824,
          aspectRatio: 2.3301,
          durationSeconds: besaFullDuration,
          resolution: '1920x824',
          codec: 'H.264 (avc1)',
          audioCodec: 'AAC (mp4a)',
          storagePath: `/uploads/${besaStorageFilename}`,
          publicUrl: `/api/media/file/${besaAssetId}`,
          processingStatus: 'ready',
          uploadStatus: 'ready',
          relatedContentId: 'cnt_1793701774719_0bebb6e7',
          driveFolderId: DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
          uploadedByUid: 'admin_mito_primary',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      besaContent = {
        contentId: 'cnt_1793701774719_0bebb6e7',
        title: 'BESA Short Film Higgsfield Global Film Festival Nominee OLL KORRECT (824p)',
        slug: 'besa-short-film-higgsfield-global-film-festival-nominee-oll-korrect-824p',
        synopsis:
          'Filmi i shkurtër kinematografik "BESA" — Rrëfim autentik mbi besën shqiptare, nderin dhe premtimin e shenjtë ("What Death Breaks, A Promise Binds" · Sinkronizuar nga MITO content / Google Drive).',
        description:
          'BESA Short Film (Higgsfield Global Film Festival Nominee — OLL KORRECT). Ky film transmetohet drejtpërdrejt në cilësi të plotë 1920x824 dhe mund të menaxhohet, fshihet/shfaqet ose lidhet me pyetësorë nga Super Administratori.',
        type: 'legend',
        videoFormat: 'standard',
        videoContainer: 'mp4',
        aspectRatio: 2.3301,
        width: 1920,
        height: 824,
        durationSeconds: besaFullDuration,
        resolution: '1920x824',
        codec: 'H.264 (avc1)',
        audioCodec: 'AAC (mp4a)',
        fileSizeBytes: besaFullFileSize,
        storagePath: `/uploads/${besaStorageFilename}`,
        thumbnailUrl: besaCoverUrl,
        posterUrl: besaCoverUrl,
        heroUrl: besaCoverUrl,
        playbackUrl: `/api/media/file/${besaAssetId}`,
        processingStatus: 'ready',
        uploadStatus: 'ready',
        captions: [
          {
            id: 'sub_sq',
            lang: 'sq',
            label: 'Shqip',
            vttUrl: '',
            vttContent:
              'WEBVTT\n\n00:00:00.000 --> 00:10:31.000\nBESA — Fjala e nderit dhe premtimi i shenjtë shqiptar.',
          },
        ],
        publicationStatus: 'published',
        relatedStoryIds: [],
        relatedGameIds: ['game_besa_quiz'],
        categoryIds: [db.categories[0]?.categoryId || 'cat_legjenda'],
        tags: ['besa', 'short-film', 'google-drive', 'shqipëri'],
        language: 'Shqip',
        region: 'Shqipëri',
        featured: true,
        cropMode: 'preserve',
        creatorAttribution: 'OLL KORRECT · Google Drive (MITO content)',
        watchToUnlock: {
          enabled: false,
          requiredCompletionPercent: 0,
          mandatoryForAllGames: false,
        },
        provenance: {
          sourceReferences: 'Google Drive Folder MITO content (1nuao4j4D1a2ZO6cN_WoHBwWOPMbmFbq5)',
          bibliography: 'BESA Short Film — OLL KORRECT',
          storyteller: 'OLL KORRECT',
          regionOfOrigin: 'Shqipëri',
          dialect: 'Standarde',
          recordingDate: nowIso.slice(0, 10),
          consentStatus: 'verified',
          rightsAndLicensing: 'MITO Google Drive Sync',
          editorialNotes: 'Sinkronizuar nga Google Drive.',
          verifiedHistoricalFact: true,
        },
        viewsCount: 1,
        likesCount: 1,
        savesCount: 1,
        totalWatchDurationSeconds: 60,
        completionCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        publishedAt: nowIso,
        driveFolderId: DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
        driveFolderUrl: DEFAULT_GOOGLE_DRIVE_FOLDER_URL,
        lastDriveSyncAt: nowIso,
      };
      db.content.unshift(besaContent);
      mutated = true;
    } else if (besaContent) {
      if (
        besaContent.thumbnailUrl !== besaCoverUrl ||
        besaContent.posterUrl !== besaCoverUrl ||
        besaContent.heroUrl !== besaCoverUrl ||
        besaContent.durationSeconds !== besaFullDuration ||
        besaContent.fileSizeBytes !== besaFullFileSize ||
        besaContent.width !== 1920 ||
        besaContent.height !== 824
      ) {
        besaContent.thumbnailUrl = besaCoverUrl;
        besaContent.posterUrl = besaCoverUrl;
        besaContent.heroUrl = besaCoverUrl;
        besaContent.durationSeconds = besaFullDuration;
        besaContent.fileSizeBytes = besaFullFileSize;
        besaContent.width = 1920;
        besaContent.height = 824;
        besaContent.resolution = '1920x824';
        besaContent.aspectRatio = 2.3301;
        besaContent.playbackUrl = `/api/media/file/${besaAssetId}`;
        mutated = true;
      }
      const besaAsset = db.mediaAssets.find((a) => a.assetId === besaAssetId);
      if (
        besaAsset &&
        (besaAsset.durationSeconds !== besaFullDuration ||
          besaAsset.fileSizeBytes !== besaFullFileSize)
      ) {
        besaAsset.durationSeconds = besaFullDuration;
        besaAsset.fileSizeBytes = besaFullFileSize;
        besaAsset.width = 1920;
        besaAsset.height = 824;
        besaAsset.resolution = '1920x824';
        besaAsset.aspectRatio = 2.3301;
        mutated = true;
      }
    }

    // Ensure every content item is linked to the Google Drive folder & has 0% watch requirement
    for (const c of db.content) {
      if (!c.driveFolderId) {
        c.driveFolderId = DEFAULT_GOOGLE_DRIVE_FOLDER_ID;
        c.driveFolderUrl = DEFAULT_GOOGLE_DRIVE_FOLDER_URL;
        mutated = true;
      }
      if (c.watchToUnlock?.enabled || (c.watchToUnlock?.requiredCompletionPercent ?? 0) > 0) {
        c.watchToUnlock = {
          enabled: false,
          requiredCompletionPercent: 0,
          mandatoryForAllGames: false,
        };
        mutated = true;
      }
    }

    // Ensure a questionnaire/quiz exists for the BESA film and has requireWatchToUnlock = false
    const primaryVideo = db.content[0];
    let besaQuiz = db.games.find((g) => g.gameId === 'game_besa_quiz');
    if (!besaQuiz && primaryVideo) {
      store.unmarkDeleted(['game_besa_quiz', 'q_besa_1', 'q_besa_2', 'q_besa_3', 'q_besa_4']);
      besaQuiz = {
        gameId: 'game_besa_quiz',
        title: 'Pyetësori i Filmit: BESA (Short Film)',
        description:
          'Pyetësor interaktiv mbi tematikën, mesazhin dhe traditën e Besës në filmin BESA. Mund të luhet menjëherë pa detyrim shikimi.',
        coverImageUrl:
          primaryVideo.posterUrl ||
          primaryVideo.thumbnailUrl ||
          '/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png',
        instructions: 'Përgjigju pyetjeve rreth filmit BESA për të fituar pikë dhe XP.',
        gameType: 'quiz_battle',
        difficulty: 'mesatare',
        maxPlayers: 12,
        questionCount: 4,
        timePerQuestionSeconds: 20,
        scoringMethod: 'speed_bonus',
        xpReward: 250,
        categoryId: db.categories[0]?.categoryId || 'cat_legjenda',
        linkedContentId: primaryVideo.contentId,
        requireWatchToUnlock: false,
        requiredWatchPercent: 0,
        challengePeriod: 'weekly',
        publicationStatus: 'published',
        playsCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.games.unshift(besaQuiz);

      db.gameQuestions = db.gameQuestions.filter((q) => q.gameId !== 'game_besa_quiz');
      db.gameQuestions.push(
        {
          questionId: 'q_besa_1',
          gameId: 'game_besa_quiz',
          order: 1,
          questionText: 'Çfarë përfaqëson koncepti "Besa" në qendër të filmit të shkurtër BESA?',
          choices: [
            'Premtimin e shenjtë, fjalën e nderit dhe mbrojtjen e mikut me çdo çmim',
            'Një marrëveshje të thjeshtë tregtare',
            'Një festë stinore bujqësore',
            'Një udhëtim detar',
          ],
          correctChoiceIndex: 0,
          timeLimitSeconds: 20,
          points: 100,
          explanation:
            'Në traditën shqiptare dhe në filmin BESA, Besa është kodi më i lartë moral i fjalës së dhënë dhe mikpritjes.',
        },
        {
          questionId: 'q_besa_2',
          gameId: 'game_besa_quiz',
          order: 2,
          questionText: 'Në cilin festival ndërkombëtar është nominuar filmi i shkurtër BESA?',
          choices: [
            'Higgsfield Global Film Festival',
            'Festivali i Muzikës Klasike',
            'Bienalja e Arkitekturës',
            'Konkursi i Fotografisë Sportive',
          ],
          correctChoiceIndex: 0,
          timeLimitSeconds: 20,
          points: 100,
          explanation:
            'Filmi BESA nga OLL KORRECT është nominuar në Higgsfield Global Film Festival.',
        },
        {
          questionId: 'q_besa_3',
          gameId: 'game_besa_quiz',
          order: 3,
          questionText: 'Si lidhet Besa me mikpritjen në kodin zakonor shqiptar?',
          choices: [
            'Shtëpia e shqiptarit i përket Zotit dhe mikut; miku nën besë mbrohet si jeta vetë',
            'Miku pritet vetëm në ditë feste',
            'Mikpritja vlen vetëm për të afërmit e familjes',
            'Nuk ka lidhje me mbrojtjen e mikut',
          ],
          correctChoiceIndex: 0,
          timeLimitSeconds: 20,
          points: 100,
          explanation:
            'Parimi "Shtëpia e shqiptarit është e Zotit dhe e mikut" e kthen mbrojtjen e mikut në detyrë të shenjtë.',
        },
        {
          questionId: 'q_besa_4',
          gameId: 'game_besa_quiz',
          order: 4,
          questionText: 'Cili është mesazhi kryesor artistik që përcjell filmi BESA?',
          choices: [
            'Forca e sakrificës, përgjegjësisë morale dhe besnikërisë ndaj fjalës së dhënë',
            'Rëndësia e shpejtësisë në sport',
            'Historia e industrisë moderne',
            'Ndërtimi i rrugëve tregtare',
          ],
          correctChoiceIndex: 0,
          timeLimitSeconds: 20,
          points: 100,
          explanation:
            'Filmi dramatik BESA sjell në ekran peshën emocionale dhe fisnikërinë e mbajtjes së fjalës së dhënë.',
        }
      );
      mutated = true;
    }

    // Ensure all games have requireWatchToUnlock = false and requiredWatchPercent = 0
    for (const g of db.games) {
      if (g.requireWatchToUnlock || g.requiredWatchPercent > 0) {
        g.requireWatchToUnlock = false;
        g.requiredWatchPercent = 0;
        mutated = true;
      }
      if (primaryVideo && (!g.linkedContentId || legacyContentIds.has(g.linkedContentId))) {
        g.linkedContentId = primaryVideo.contentId;
        mutated = true;
      }
    }

    if (primaryVideo && besaQuiz && !primaryVideo.relatedGameIds.includes(besaQuiz.gameId)) {
      primaryVideo.relatedGameIds.unshift(besaQuiz.gameId);
      mutated = true;
    }

    if (mutated) {
      store.commit();
    }
    return mutated;
  }

  // Run catalog normalization immediately on boot
  ensureGoogleDriveCatalogState();

  // Manual file uploads in the Admin Platform are disabled by policy — all videos & covers come from Google Drive
  app.post('/api/admin/media/upload-init', requireAdmin, async (_req: AuthenticatedRequest, res) => {
    res.status(403).json({
      error:
        'Ngarkimi manual i videove nga platforma është çaktivizuar. Të gjitha videot dhe kopertinat shtohen vetëm përmes dosjes së Google Drive.',
      code: 'MANUAL_UPLOAD_DISABLED_USE_GOOGLE_DRIVE',
    });
  });

  // Step 2: Append Resumable Chunk (Kept only for legacy compatibility, blocked for new manual uploads)
  app.post('/api/admin/media/upload-chunk/:assetId', requireAdmin, (req: AuthenticatedRequest, res) => {
    const { assetId } = req.params;
    const { chunkBase64 } = req.body || {};
    const db = store.getState();
    const asset = db.mediaAssets.find((a) => a.assetId === assetId);
    if (!asset) {
      res.status(404).json({ error: 'Skedari media nuk u gjet.' });
      return;
    }

    if (typeof chunkBase64 !== 'string' || chunkBase64.length === 0) {
      res.status(400).json({ error: 'Chunk i zbrazët.' });
      return;
    }

    const diskFilename = path.basename(asset.storagePath);
    const diskPath = path.join(UPLOADS_DIR, diskFilename);
    const chunkBuf = Buffer.from(chunkBase64, 'base64');
    fs.appendFileSync(diskPath, chunkBuf);

    const stat = fs.statSync(diskPath);
    asset.fileSizeBytes = stat.size;
    asset.updatedAt = new Date().toISOString();

    res.json({
      assetId: asset.assetId,
      receivedBytes: stat.size,
      uploadStatus: asset.uploadStatus,
    });
  });

  // Step 3: Complete Upload, Optimize for Web Streaming, Extract Thumbnail & Persist to Cloud
  app.post('/api/admin/media/upload-complete/:assetId', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { assetId } = req.params;
    const { expectedFormat, draftTitle } = req.body || {};
    const db = store.getState();
    const asset = db.mediaAssets.find((a) => a.assetId === assetId);
    if (!asset) {
      res.status(404).json({ error: 'Skedari media nuk u gjet.' });
      return;
    }

    const diskFilename = path.basename(asset.storagePath);
    const diskPath = path.join(UPLOADS_DIR, diskFilename);
    if (!fs.existsSync(diskPath)) {
      res.status(400).json({ error: 'Skedari fizik nuk u gjet në ruajtje.' });
      return;
    }

    const stat = fs.statSync(diskPath);
    asset.fileSizeBytes = stat.size;
    const format: 'short' | 'standard' =
      expectedFormat === 'short' || asset.videoFormat === 'short' ? 'short' : 'standard';
    asset.videoFormat = format;

    const ext = path.extname(asset.filename).toLowerCase();
    const isVideo =
      ['.mp4', '.mov', '.m4v', '.webm', '.mkv'].includes(ext) ||
      asset.mimeType.includes('video') ||
      asset.mimeType.includes('mp4');

    let parsedMetadata: ReturnType<typeof inspectAndOptimizeUploadedVideo> | null = null;

    if (isVideo) {
      asset.processingStatus = 'processing';
      const inspected = inspectAndOptimizeUploadedVideo(diskPath, asset.assetId, format);
      parsedMetadata = inspected;
      asset.width = inspected.width;
      asset.height = inspected.height;
      asset.aspectRatio = inspected.aspectRatio;
      asset.durationSeconds = inspected.durationSeconds;
      asset.resolution = inspected.resolution;
      asset.codec = inspected.codec;
      asset.audioCodec = inspected.audioCodec;
      asset.mimeType = 'video/mp4';
      asset.fileSizeBytes = fs.statSync(diskPath).size;
      if (inspected.autoThumbnailUrl) {
        asset.autoThumbnailUrl = inspected.autoThumbnailUrl;
      }
    }

    asset.uploadStatus = 'ready';
    asset.processingStatus = 'ready';
    asset.updatedAt = new Date().toISOString();

    // Auto-create a published VideoContent record if not yet linked so the uploaded video is immediately saved & playable
    let autoContent = asset.relatedContentId
      ? db.content.find((c) => c.contentId === asset.relatedContentId)
      : undefined;

    if (!autoContent) {
      const nowIso = new Date().toISOString();
      const contentId = `cnt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const cleanBaseTitle = String(
        draftTitle || asset.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
      ).trim() || 'Video e Re MITO';
      const width = asset.width || (format === 'short' ? 1080 : 1920);
      const height = asset.height || (format === 'short' ? 1920 : 1080);
      const thumb =
        asset.autoThumbnailUrl ||
        '/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png';

      autoContent = {
        contentId,
        title: cleanBaseTitle,
        slug:
          cleanBaseTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || contentId,
        synopsis: `Material origjinal i ngarkuar në platformën MITO (${asset.resolution || `${width}x${height}`}).`,
        description: cleanBaseTitle,
        type: 'legend',
        videoFormat: format,
        videoContainer: 'mp4',
        aspectRatio: Number((width / height).toFixed(4)),
        width,
        height,
        durationSeconds: asset.durationSeconds || (format === 'short' ? 45 : 120),
        resolution: `${width}x${height}`,
        codec: asset.codec || 'H.264 (avc1)',
        audioCodec: asset.audioCodec || 'AAC (mp4a)',
        fileSizeBytes: asset.fileSizeBytes,
        storagePath: asset.storagePath,
        thumbnailUrl: thumb,
        posterUrl: thumb,
        heroUrl: thumb,
        playbackUrl: `/api/media/file/${asset.assetId}`,
        processingStatus: 'ready',
        uploadStatus: 'ready',
        captions: [],
        publicationStatus: 'published',
        relatedStoryIds: [],
        relatedGameIds: [],
        categoryIds: db.categories[0] ? [db.categories[0].categoryId] : [],
        tags: ['mito', format === 'short' ? 'shorts' : 'video'],
        language: 'Shqip',
        region: 'Shqipëri',
        featured: true,
        cropMode: 'preserve',
        creatorAttribution: 'Arkivi Kulturor MITO',
        watchToUnlock: {
          enabled: false,
          requiredCompletionPercent: 80,
          mandatoryForAllGames: false,
        },
        provenance: {
          sourceReferences: 'Arkivi MITO',
          bibliography: '',
          storyteller: 'MITO Studio',
          regionOfOrigin: 'Shqipëri',
          dialect: 'Standarde',
          recordingDate: nowIso.slice(0, 10),
          consentStatus: 'verified',
          rightsAndLicensing: 'MITO Heritage License',
          editorialNotes: '',
          verifiedHistoricalFact: true,
        },
        viewsCount: 0,
        likesCount: 0,
        savesCount: 0,
        totalWatchDurationSeconds: 0,
        completionCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        publishedAt: nowIso,
      };

      store.unmarkDeleted(contentId);
      db.content.unshift(autoContent);
      asset.relatedContentId = contentId;
    }

    // Persist video binary to Firestore chunks so it survives container restarts and works across dev/prod instances
    await Promise.race([
      store.saveMediaFileToCloud(asset.assetId, diskPath),
      new Promise((resolve) => setTimeout(resolve, 4500)),
    ]);

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'MEDIA_UPLOAD_COMPLETED',
      targetId: asset.assetId,
      details: `U ngarkua, u optimizua dhe u ruajt në cloud skedari ${asset.filename} (${asset.resolution || 'asset'}, ${asset.fileSizeBytes} bajt).`,
      severity: 'info',
    });
    await store.commitAsync();

    res.json({
      asset,
      autoContent,
      parsedMetadata,
      aspectWarningSq:
        format === 'short' && parsedMetadata && parsedMetadata.needsVerticalAspectWarning
          ? `Kujdes: Kjo video ka raport dimensioni ${parsedMetadata.width}×${parsedMetadata.height} (${parsedMetadata.aspectRatio}), jo formatin vertikal 9:16 (1080×1920). Zgjidhni nëse dëshironi të ruani raportin origjinal apo ta prisni (crop) qëllimisht në 9:16.`
          : null,
    });
  });

  // Cancel Upload
  app.post('/api/admin/media/upload-cancel/:assetId', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { assetId } = req.params;
    const db = store.getState();
    const idx = db.mediaAssets.findIndex((a) => a.assetId === assetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Skedari nuk u gjet.' });
      return;
    }
    const asset = db.mediaAssets[idx];
    const diskPath = path.join(UPLOADS_DIR, path.basename(asset.storagePath));
    if (fs.existsSync(diskPath)) {
      fs.unlinkSync(diskPath);
    }
    db.mediaAssets.splice(idx, 1);
    store.markDeleted(assetId);
    await store.commitAsync();
    res.json({ ok: true });
  });

  // Server-side helper to generate a real playable binary MP4 file with exact dimensions (9:16 vertical, 16:9 standard, or 4:3 warning test)
  app.post('/api/admin/media/generate-sample-mp4', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { preset } = req.body || {};
    let width = 1080;
    let height = 1920;
    let durationSeconds = 12;
    let videoFormat: 'short' | 'standard' = 'short';
    let filename = 'mito_short_9_16.mp4';

    if (preset === 'standard_16_9') {
      width = 1920;
      height = 1080;
      durationSeconds = 15;
      videoFormat = 'standard';
      filename = 'mito_standard_16_9.mp4';
    } else if (preset === 'non_9_16_warning') {
      width = 1440;
      height = 1080;
      durationSeconds = 12;
      videoFormat = 'short';
      filename = 'mito_clip_4_3.mp4';
    }

    const assetId = `media_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storageFilename = `${assetId}_${filename}`;
    const diskPath = path.join(UPLOADS_DIR, storageFilename);

    const synthesized = synthesizePlayableMp4OnDisk(
      diskPath,
      width,
      height,
      durationSeconds,
      '/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png'
    );
    if (!synthesized) {
      const mp4Buf = createMinimalMp4Buffer(width, height, durationSeconds);
      fs.writeFileSync(diskPath, mp4Buf);
    }

    const stat = fs.statSync(diskPath);
    const aspectRatio = Number((width / height).toFixed(4));
    const parsedMetadata = {
      isValidMp4: true,
      videoContainer: 'mp4' as const,
      width,
      height,
      durationSeconds,
      aspectRatio,
      resolution: `${width}x${height}`,
      codec: 'H.264 (avc1)',
      audioCodec: 'AAC (mp4a)',
      isVertical916: Math.abs(aspectRatio - 9 / 16) <= 0.04,
      isLandscape169: Math.abs(aspectRatio - 16 / 9) <= 0.08,
      needsVerticalAspectWarning: Math.abs(aspectRatio - 9 / 16) > 0.04,
    };
    const nowIso = new Date().toISOString();

    const asset: MediaAsset = {
      assetId,
      filename,
      mimeType: 'video/mp4',
      fileSizeBytes: stat.size,
      videoFormat,
      width: parsedMetadata.width,
      height: parsedMetadata.height,
      aspectRatio: parsedMetadata.aspectRatio,
      durationSeconds: parsedMetadata.durationSeconds,
      resolution: parsedMetadata.resolution,
      codec: parsedMetadata.codec,
      audioCodec: parsedMetadata.audioCodec,
      storagePath: `/uploads/${storageFilename}`,
      publicUrl: `/api/media/file/${assetId}`,
      processingStatus: 'ready',
      uploadStatus: 'ready',
      uploadedByUid: req.user!.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.unmarkDeleted(assetId);
    const db = store.getState();
    db.mediaAssets.unshift(asset);
    await store.saveMediaFileToCloud(assetId, diskPath);
    await store.commitAsync();

    res.status(201).json({
      asset,
      parsedMetadata,
      aspectWarningSq:
        videoFormat === 'short' && parsedMetadata.needsVerticalAspectWarning
          ? `Kujdes: Kjo video ka raport dimensioni ${parsedMetadata.width}×${parsedMetadata.height} (${parsedMetadata.aspectRatio}), jo formatin vertikal 9:16 (1080×1920). Zgjidhni nëse dëshironi të ruani raportin origjinal apo ta prisni (crop) qëllimisht në 9:16.`
          : null,
    });
  });

  // Serve offloaded or inline content thumbnail image
  app.get('/api/media/thumb/:contentId', async (req, res) => {
    const { contentId } = req.params;
    const db = store.getState();
    const item = db.content.find((c) => c.contentId === contentId);
    if (
      contentId === 'cnt_1793701774719_0bebb6e7' ||
      item?.title?.toLowerCase().includes('besa')
    ) {
      const besaCoverPath = path.join(process.cwd(), 'public/assets/aistudio/BesaCover_3b623702.jpg');
      if (fs.existsSync(besaCoverPath)) {
        res.sendFile(besaCoverPath);
        return;
      }
    }

    const dataUrl =
      (item?.thumbnailUrl && item.thumbnailUrl.startsWith('data:image/') ? item.thumbnailUrl : null) ||
      (await store.getCloudThumbnail(contentId));

    if (dataUrl && dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buf = Buffer.from(match[2], 'base64');
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=86400',
        });
        res.end(buf);
        return;
      }
    }

    res.redirect('/assets/aistudio/BesaCover_3b623702.jpg');
  });

  // Serve uploaded media file with HTTP Range support & automatic Cloud Restore / Synthesis
  app.get('/api/media/file/:assetId', async (req, res) => {
    const { assetId } = req.params;
    let db = store.getState();
    let asset = db.mediaAssets.find((a) => a.assetId === assetId);
    if (!asset) {
      await store.syncFromCloud(true);
      db = store.getState();
      asset = db.mediaAssets.find((a) => a.assetId === assetId);
    }

    const relatedContent = db.content.find(
      (c) =>
        c.contentId === asset?.relatedContentId ||
        c.playbackUrl.includes(assetId) ||
        c.storagePath.includes(assetId)
    );

    if (!asset && relatedContent) {
      const fallbackFilename = path.basename(relatedContent.storagePath || `${assetId}.mp4`);
      asset = {
        assetId,
        filename: fallbackFilename,
        mimeType: 'video/mp4',
        fileSizeBytes: relatedContent.fileSizeBytes || 0,
        videoFormat: relatedContent.videoFormat,
        width: relatedContent.width,
        height: relatedContent.height,
        aspectRatio: relatedContent.aspectRatio,
        durationSeconds: relatedContent.durationSeconds,
        resolution: relatedContent.resolution,
        codec: relatedContent.codec,
        audioCodec: relatedContent.audioCodec,
        storagePath: `/uploads/${fallbackFilename}`,
        publicUrl: `/api/media/file/${assetId}`,
        processingStatus: 'ready',
        uploadStatus: 'ready',
        relatedContentId: relatedContent.contentId,
        uploadedByUid: 'usr_super_admin_mito',
        createdAt: relatedContent.createdAt,
        updatedAt: relatedContent.updatedAt,
      };
      db.mediaAssets.unshift(asset);
    }

    if (!asset) {
      res.status(404).send('Not found');
      return;
    }

    const diskPath = await ensurePlayableVideoOnDisk(asset, relatedContent);
    if (!diskPath || !fs.existsSync(diskPath)) {
      res.status(404).send('File missing on disk');
      return;
    }

    streamVideoFileWithRange(req, res, diskPath, asset.mimeType || 'video/mp4');
  });

  // Direct content stream fallback route (/api/stream/:contentId)
  app.get('/api/stream/:contentId', async (req, res) => {
    const { contentId } = req.params;
    const db = store.getState();
    const item = db.content.find((c) => c.contentId === contentId);
    if (!item) {
      res.status(404).send('Content not found');
      return;
    }

    let asset = db.mediaAssets.find(
      (a) =>
        a.relatedContentId === item.contentId ||
        item.playbackUrl.includes(a.assetId) ||
        a.storagePath === item.storagePath
    );

    if (!asset) {
      const assetId = `media_${item.contentId}`;
      const filename = path.basename(item.storagePath || `${item.contentId}.mp4`);
      asset = {
        assetId,
        filename,
        mimeType: 'video/mp4',
        fileSizeBytes: item.fileSizeBytes || 0,
        videoFormat: item.videoFormat,
        width: item.width,
        height: item.height,
        aspectRatio: item.aspectRatio,
        durationSeconds: item.durationSeconds,
        resolution: item.resolution,
        codec: item.codec,
        audioCodec: item.audioCodec,
        storagePath: `/uploads/${filename}`,
        publicUrl: `/api/media/file/${assetId}`,
        processingStatus: 'ready',
        uploadStatus: 'ready',
        relatedContentId: item.contentId,
        uploadedByUid: 'usr_super_admin_mito',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
      db.mediaAssets.unshift(asset);
    }

    const diskPath = await ensurePlayableVideoOnDisk(asset, item);
    if (!diskPath || !fs.existsSync(diskPath)) {
      res.status(404).send('Stream file missing');
      return;
    }

    streamVideoFileWithRange(req, res, diskPath, asset.mimeType || 'video/mp4');
  });

  // Also support /uploads/:filename directly
  app.get('/uploads/:filename', async (req, res) => {
    const { filename } = req.params;
    const db = store.getState();
    const asset = db.mediaAssets.find((a) => path.basename(a.storagePath) === filename);
    if (asset) {
      const relatedContent = db.content.find((c) => c.contentId === asset.relatedContentId);
      const diskPath = await ensurePlayableVideoOnDisk(asset, relatedContent);
      if (diskPath && fs.existsSync(diskPath)) {
        streamVideoFileWithRange(req, res, diskPath, asset.mimeType || 'video/mp4');
        return;
      }
    }
    const rawPath = path.join(UPLOADS_DIR, path.basename(filename));
    if (fs.existsSync(rawPath)) {
      streamVideoFileWithRange(req, res, rawPath, 'video/mp4');
      return;
    }
    res.status(404).send('Not found');
  });

  // =========================================================
  // 3. CONTENT, SHORTS & STREAMING PLAYBACK
  // =========================================================

  app.get('/api/catalog', requireAuth, (req: AuthenticatedRequest, res) => {
    ensureGoogleDriveCatalogState();
    const db = store.getState();
    const user = req.user!;
    const published = db.content.filter((c) => c.publicationStatus === 'published');

    // Filter standard videos vs shorts according to user access policy
    const accessibleContent = published.filter((item) => {
      if (user.role === 'super_admin') return true;
      const policy = user.accessPolicy;
      if (item.videoFormat === 'short' && !policy.shortsEnabled) return false;
      if (item.videoFormat === 'standard' && !policy.streamingEnabled) return false;
      if (policy.contentScope === 'selected_content') {
        return policy.allowedContentIds.includes(item.contentId);
      }
      if (policy.contentScope === 'selected_categories') {
        return item.categoryIds.some((cid) => policy.allowedCategoryIds.includes(cid));
      }
      return true;
    });

    const standardVideos = accessibleContent.filter((c) => c.videoFormat === 'standard');
    const shortVideos = accessibleContent.filter((c) => c.videoFormat === 'short');

    const userProgress = db.playbackProgress.filter((p) => p.userId === user.uid);
    const publishedGames = db.games
      .filter((g) => g.publicationStatus === 'published')
      .map((game) => {
        const linkedProgress = game.linkedContentId
          ? userProgress.find((p) => p.contentId === game.linkedContentId)
          : undefined;
        const unlockStatus = isGameUnlockedByWatchProgress({
          requireWatchToUnlock: game.requireWatchToUnlock,
          requiredWatchPercent: game.requiredWatchPercent,
          userCompletionPercent: linkedProgress?.completionPercent || 0,
          isSuperAdmin: user.role === 'super_admin',
        });
        return {
          ...game,
          unlockStatus,
        };
      });

    res.json({
      standardVideos,
      shortVideos,
      categories: db.categories.sort((a, b) => a.order - b.order),
      episodes: db.episodes.filter((e) => e.publicationStatus === 'published'),
      progress: userProgress,
      games: publishedGames,
      siteSettings: db.siteSettings,
    });
  });

  app.get('/api/content/:contentId', requireAuth, (req: AuthenticatedRequest, res) => {
    const { contentId } = req.params;
    const db = store.getState();
    const user = req.user!;
    const item = db.content.find((c) => c.contentId === contentId);
    if (!item || (item.publicationStatus !== 'published' && user.role !== 'super_admin')) {
      res.status(404).json({ error: 'Përmbajtja nuk u gjet.' });
      return;
    }

    const userProgressList = db.playbackProgress.filter((p) => p.userId === user.uid);
    const distinctWatched = userProgressList.map((p) => p.contentId);
    const thisProgress = userProgressList.find((p) => p.contentId === contentId);

    const accessCheck = evaluateContentAccess(
      user,
      item,
      distinctWatched,
      thisProgress?.viewsCount || 0
    );
    if (!accessCheck.allowed) {
      res.status(403).json({
        error: accessCheck.messageSq || 'Ky material nuk është i disponueshëm për llogarinë tënde.',
        code: accessCheck.reasonCode,
      });
      return;
    }

    const episodes = db.episodes
      .filter((e) => e.seriesContentId === item.contentId && e.publicationStatus === 'published')
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);

    const relatedGames = db.games
      .filter(
        (g) =>
          g.publicationStatus === 'published' &&
          (g.linkedContentId === item.contentId || item.relatedGameIds.includes(g.gameId))
      )
      .map((g) => ({
        ...g,
        unlockStatus: isGameUnlockedByWatchProgress({
          requireWatchToUnlock: g.requireWatchToUnlock,
          requiredWatchPercent: g.requiredWatchPercent,
          userCompletionPercent: thisProgress?.completionPercent || 0,
          isSuperAdmin: user.role === 'super_admin',
        }),
      }));

    const linkedContent = item.linkedContentId
      ? db.content.find((c) => c.contentId === item.linkedContentId)
      : null;

    const relatedStories = db.content
      .filter(
        (c) =>
          c.contentId !== item.contentId &&
          c.publicationStatus === 'published' &&
          (item.relatedStoryIds.includes(c.contentId) || c.type === item.type)
      )
      .slice(0, 6);

    res.json({
      content: item,
      progress: thisProgress || null,
      episodes,
      relatedGames,
      linkedContent,
      relatedStories,
    });
  });

  // Request short-lived signed playback session & increment real view counter
  app.post('/api/content/:contentId/playback-session', requireAuth, (req: AuthenticatedRequest, res) => {
    const { contentId } = req.params;
    const db = store.getState();
    const user = req.user!;
    const item = db.content.find((c) => c.contentId === contentId);

    if (!item || (item.publicationStatus !== 'published' && user.role !== 'super_admin')) {
      res.status(404).json({ error: 'Videoja nuk u gjet.' });
      return;
    }

    const userProgressList = db.playbackProgress.filter((p) => p.userId === user.uid);
    const distinctWatched = userProgressList.map((p) => p.contentId);
    let progress = userProgressList.find((p) => p.contentId === contentId);

    const accessCheck = evaluateContentAccess(user, item, distinctWatched, progress?.viewsCount || 0);
    if (!accessCheck.allowed) {
      res.status(403).json({
        error: accessCheck.messageSq || 'Ky material nuk është i disponueshëm për llogarinë tënde.',
        code: accessCheck.reasonCode,
      });
      return;
    }

    // Increment real view statistics
    item.viewsCount = (item.viewsCount || 0) + 1;
    const nowIso = new Date().toISOString();

    if (!progress) {
      progress = {
        progressId: `prog_${user.uid}_${contentId}`,
        userId: user.uid,
        contentId,
        videoFormat: item.videoFormat,
        currentTimeSeconds: item.videoFormat === 'standard' ? (user.accessPolicy.permittedStartSecond || 0) : 0,
        durationSeconds: item.durationSeconds || 60,
        watchedSegments: [],
        uniqueWatchedSeconds: 0,
        completionPercent: 0,
        unlockedGame: false,
        viewsCount: 1,
        updatedAt: nowIso,
      };
      db.playbackProgress.push(progress);
    } else {
      progress.viewsCount = (progress.viewsCount || 0) + 1;
      progress.updatedAt = nowIso;
    }

    // Check first explore achievement
    const newAchievements = evaluateNewAchievements(user, distinctWatched.length + 1, db.achievements);
    for (const ach of newAchievements) {
      user.achievements.push(ach.achievementId);
      user.stats.totalXp += ach.xpBonus;
      user.recentActivity.unshift({
        id: `act_${Date.now()}_${ach.achievementId}`,
        type: 'achievement',
        title: `Arritje e zhbllokuar: ${ach.title}`,
        timestamp: nowIso,
        detail: `+${ach.xpBonus} XP`,
      });
    }

    user.recentActivity.unshift({
      id: `act_${Date.now()}`,
      type: item.videoFormat === 'short' ? 'short' : 'watch',
      title: `${item.videoFormat === 'short' ? 'MITO Short' : 'Shikim'}: ${item.title}`,
      timestamp: nowIso,
    });
    user.recentActivity = user.recentActivity.slice(0, 25);

    appendSessionActivity(
      req,
      item.videoFormat === 'short' ? 'short' : 'watch',
      item.title,
      item.videoFormat === 'short' ? 'Duke parë MITO Short' : 'Duke parë Filmin / Videon'
    );

    const expMs = Date.now() + 15 * 60_000; // 15-minute signed playback token
    const signedPlaybackToken = signToken(`${user.uid}:${contentId}:${expMs}`);

    store.commit();

    res.json({
      signedPlaybackUrl: `${item.playbackUrl}${item.playbackUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(signedPlaybackToken)}`,
      progress,
      watermarkText: db.siteSettings.watermarkEnabled ? `MITO · ${user.maskedCode}` : null,
      maxPlaybackSeconds: user.accessPolicy.maxPlaybackSecondsPerItem || null,
      permittedStartSecond: user.accessPolicy.permittedStartSecond || null,
      permittedEndSecond: user.accessPolicy.permittedEndSecond || null,
      lowTimeWarningSq: accessCheck.lowTimeWarningSq || null,
    });
  });

  // Periodic Playback Heartbeat & Watch-to-Unlock Verification
  app.post('/api/content/:contentId/heartbeat', requireAuth, (req: AuthenticatedRequest, res) => {
    const { contentId } = req.params;
    const { currentTimeSeconds, segmentStart, segmentEnd } = req.body || {};
    const db = store.getState();
    const user = req.user!;
    const item = db.content.find((c) => c.contentId === contentId);

    if (!item) {
      res.status(404).json({ error: 'Përmbajtja nuk u gjet.' });
      return;
    }

    // Revalidate active time & daily usage limits during playback
    const timeCheck = evaluateAccountTimeAccess(user);
    if (!timeCheck.allowed) {
      res.status(403).json({
        expired: true,
        error: timeCheck.messageSq || 'Sesioni yt ka përfunduar.',
      });
      return;
    }

    let progress = db.playbackProgress.find(
      (p) => p.userId === user.uid && p.contentId === contentId
    );
    const nowIso = new Date().toISOString();

    if (!progress) {
      progress = {
        progressId: `prog_${user.uid}_${contentId}`,
        userId: user.uid,
        contentId,
        videoFormat: item.videoFormat,
        currentTimeSeconds: Number(currentTimeSeconds || 0),
        durationSeconds: item.durationSeconds || 60,
        watchedSegments: [],
        uniqueWatchedSeconds: 0,
        completionPercent: 0,
        unlockedGame: false,
        viewsCount: 1,
        updatedAt: nowIso,
      };
      db.playbackProgress.push(progress);
    }

    const prevWatchedSeconds = progress.uniqueWatchedSeconds;
    const startSec = Number(segmentStart ?? progress.currentTimeSeconds ?? 0);
    const endSec = Number(segmentEnd ?? currentTimeSeconds ?? startSec);

    progress.watchedSegments = mergeWatchedSegments(
      progress.watchedSegments,
      { start: startSec, end: endSec },
      item.durationSeconds || 60
    );

    const calc = calculateSegmentProgress(progress.watchedSegments, item.durationSeconds || 60);
    const deltaNewSeconds = Math.max(0, calc.uniqueWatchedSeconds - prevWatchedSeconds);

    progress.currentTimeSeconds = Number(currentTimeSeconds || endSec);
    progress.uniqueWatchedSeconds = calc.uniqueWatchedSeconds;
    progress.completionPercent = calc.completionPercent;
    progress.updatedAt = nowIso;

    // Update real watch duration stats on content and user daily quota
    const heartbeatDelta = Math.max(0, Math.min(15, Math.round(endSec - startSec)));
    item.totalWatchDurationSeconds = (item.totalWatchDurationSeconds || 0) + (deltaNewSeconds || heartbeatDelta);

    const todayStr = nowIso.slice(0, 10);
    if (user.stats.lastActivityDate !== todayStr) {
      user.stats.lastActivityDate = todayStr;
      user.stats.watchedSecondsToday = 0;
      user.stats.gameSessionsToday = 0;
    }
    user.stats.watchedSecondsToday += deltaNewSeconds || heartbeatDelta;

    const requiredThreshold = item.watchToUnlock?.requiredCompletionPercent || 80;
    const wasUnlocked = progress.unlockedGame;
    if (progress.completionPercent >= requiredThreshold) {
      progress.unlockedGame = true;
      if (!wasUnlocked) {
        item.completionCount = (item.completionCount || 0) + 1;
      }
    }

    appendSessionActivity(
      req,
      item.videoFormat === 'short' ? 'short' : 'watch',
      item.title,
      `Shikuar deri në ${Math.round(progress.currentTimeSeconds)}s (${progress.completionPercent}%)`
    );

    store.commit();

    res.json({
      progress,
      justUnlockedGame: !wasUnlocked && progress.unlockedGame,
      lowTimeWarningSq: timeCheck.lowTimeWarningSq || null,
      remainingMinutes: timeCheck.remainingMinutes,
    });
  });

  // Like / Save interaction on MITO Shorts & Standard Content
  app.post('/api/shorts/:contentId/interact', requireAuth, (req: AuthenticatedRequest, res) => {
    const { contentId } = req.params;
    const { action } = req.body || {}; // 'like' | 'save'
    const db = store.getState();
    const user = req.user!;
    const item = db.content.find((c) => c.contentId === contentId);
    if (!item) {
      res.status(404).json({ error: 'Videoja nuk u gjet.' });
      return;
    }

    if (action === 'like') {
      const idx = user.likedShortIds.indexOf(contentId);
      if (idx === -1) {
        user.likedShortIds.push(contentId);
        item.likesCount = (item.likesCount || 0) + 1;
      } else {
        user.likedShortIds.splice(idx, 1);
        item.likesCount = Math.max(0, (item.likesCount || 1) - 1);
      }
    } else if (action === 'save') {
      const idx = user.savedContentIds.indexOf(contentId);
      if (idx === -1) {
        user.savedContentIds.push(contentId);
        item.savesCount = (item.savesCount || 0) + 1;
      } else {
        user.savedContentIds.splice(idx, 1);
        item.savesCount = Math.max(0, (item.savesCount || 1) - 1);
      }
    }

    store.commit();
    res.json({
      likesCount: item.likesCount,
      savesCount: item.savesCount,
      liked: user.likedShortIds.includes(contentId),
      saved: user.savedContentIds.includes(contentId),
    });
  });

  // Global Search across both MITO Shorts (9:16), Standard Streaming (16:9), and Games
  app.get('/api/search', requireAuth, (req: AuthenticatedRequest, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const db = store.getState();
    if (!q) {
      res.json({ shorts: [], standardVideos: [], games: [] });
      return;
    }

    const publishedContent = db.content.filter((c) => c.publicationStatus === 'published');
    const matchedContent = publishedContent.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.synopsis.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.region.toLowerCase().includes(q)
    );

    const matchedGames = db.games.filter(
      (g) =>
        g.publicationStatus === 'published' &&
        (g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
    );

    res.json({
      shorts: matchedContent.filter((c) => c.videoFormat === 'short'),
      standardVideos: matchedContent.filter((c) => c.videoFormat === 'standard'),
      games: matchedGames,
    });
  });

  // =========================================================
  // 4. GAME CENTER & SERVER-AUTHORITATIVE SOLO QUIZ ENGINE
  // =========================================================

  app.get('/api/games/:gameId', requireAuth, (req: AuthenticatedRequest, res) => {
    const { gameId } = req.params;
    const db = store.getState();
    const user = req.user!;
    const game = db.games.find((g) => g.gameId === gameId);
    if (!game || (game.publicationStatus !== 'published' && user.role !== 'super_admin')) {
      res.status(404).json({ error: 'Loja nuk u gjet.' });
      return;
    }

    const linkedContent = game.linkedContentId
      ? db.content.find((c) => c.contentId === game.linkedContentId)
      : null;
    const userProgress = game.linkedContentId
      ? db.playbackProgress.find((p) => p.userId === user.uid && p.contentId === game.linkedContentId)
      : undefined;

    const unlockStatus = isGameUnlockedByWatchProgress({
      requireWatchToUnlock: game.requireWatchToUnlock,
      requiredWatchPercent: game.requiredWatchPercent,
      userCompletionPercent: userProgress?.completionPercent || 0,
      isSuperAdmin: user.role === 'super_admin',
    });

    res.json({
      game,
      linkedContent,
      unlockStatus,
    });
  });

  app.post('/api/games/:gameId/start-solo', requireAuth, (req: AuthenticatedRequest, res) => {
    const { gameId } = req.params;
    const db = store.getState();
    const user = req.user!;
    const game = db.games.find((g) => g.gameId === gameId);

    if (!game || (game.publicationStatus !== 'published' && user.role !== 'super_admin')) {
      res.status(404).json({ error: 'Loja nuk u gjet.' });
      return;
    }

    const mode = req.body?.isGlobalChallenge ? 'global' : 'solo';
    const gameAccess = evaluateGameAccess(user, game, mode);
    if (!gameAccess.allowed) {
      res.status(403).json({
        error: gameAccess.messageSq || 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
      });
      return;
    }

    // Enforce Watch-to-Unlock on the server
    const userProgress = game.linkedContentId
      ? db.playbackProgress.find((p) => p.userId === user.uid && p.contentId === game.linkedContentId)
      : undefined;
    const unlockStatus = isGameUnlockedByWatchProgress({
      requireWatchToUnlock: game.requireWatchToUnlock,
      requiredWatchPercent: game.requiredWatchPercent,
      userCompletionPercent: userProgress?.completionPercent || 0,
      isSuperAdmin: user.role === 'super_admin',
    });

    if (!unlockStatus.unlocked) {
      res.status(403).json({
        error: `Duhet të shikosh të paktën ${unlockStatus.requiredPercent}% të videos lidhëse për të zhbllokuar këtë sfidë (aktualisht: ${unlockStatus.currentPercent}%).`,
        code: 'WATCH_TO_UNLOCK_REQUIRED',
        unlockStatus,
      });
      return;
    }

    const questionsFull = db.gameQuestions
      .filter((q) => q.gameId === game.gameId)
      .sort((a, b) => a.order - b.order);

    if (questionsFull.length === 0) {
      res.status(400).json({ error: 'Kjo lojë nuk ka ende pyetje të konfiguruara.' });
      return;
    }

    // Strip correctChoiceIndex & explanation before sending to browser
    const publicQuestions: GameQuestionPublic[] = questionsFull.map((q) => ({
      questionId: q.questionId,
      gameId: q.gameId,
      order: q.order,
      questionText: q.questionText,
      imageUrl: q.imageUrl,
      audioUrl: q.audioUrl,
      choices: q.choices,
      timeLimitSeconds: q.timeLimitSeconds || game.timePerQuestionSeconds || 20,
      points: q.points || 100,
    }));

    const sessionId = `quiz_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const nowMs = Date.now();
    soloQuizSessions.set(sessionId, {
      sessionId,
      userId: user.uid,
      gameId: game.gameId,
      startedAtMs: nowMs,
      currentQuestionIndex: 0,
      questionStartedAtMs: nowMs,
      answeredQuestionIndices: new Set(),
      score: 0,
      correctCount: 0,
      streak: 0,
      bestStreak: 0,
      completed: false,
    });

    const todayStr = new Date(nowMs).toISOString().slice(0, 10);
    if (user.stats.lastActivityDate !== todayStr) {
      user.stats.lastActivityDate = todayStr;
      user.stats.watchedSecondsToday = 0;
      user.stats.gameSessionsToday = 0;
    }
    user.stats.gameSessionsToday += 1;
    game.playsCount = (game.playsCount || 0) + 1;
    appendSessionActivity(req, 'game', game.title, 'Duke luajtur Kuiz / Lojë');
    store.commit();

    res.json({
      sessionId,
      game,
      questions: publicQuestions,
    });
  });

  app.post('/api/games/sessions/:sessionId/answer', requireAuth, (req: AuthenticatedRequest, res) => {
    const { sessionId } = req.params;
    const { questionIndex, choiceIndex } = req.body || {};
    const user = req.user!;
    const session = soloQuizSessions.get(sessionId);

    if (!session || session.userId !== user.uid) {
      res.status(404).json({ error: 'Sesioni i lojës nuk u gjet.' });
      return;
    }
    if (session.completed) {
      res.status(400).json({ error: 'Kjo lojë ka përfunduar tashmë.' });
      return;
    }

    const qIdx = Number(questionIndex);
    if (session.answeredQuestionIndices.has(qIdx)) {
      res.status(400).json({ error: 'Kjo pyetje është përgjigjur tashmë.' });
      return;
    }

    const db = store.getState();
    const game = db.games.find((g) => g.gameId === session.gameId);
    const questionsFull = db.gameQuestions
      .filter((q) => q.gameId === session.gameId)
      .sort((a, b) => a.order - b.order);

    const question = questionsFull[qIdx];
    if (!question || !game) {
      res.status(404).json({ error: 'Pyetja nuk u gjet.' });
      return;
    }

    const nowMs = Date.now();
    const elapsedSeconds = Math.max(0, (nowMs - session.questionStartedAtMs) / 1000);
    const isCorrect = Number(choiceIndex) === question.correctChoiceIndex;

    const scoreResult = calculateQuestionScore({
      isCorrect,
      basePoints: question.points || 100,
      timeLimitSeconds: question.timeLimitSeconds || game.timePerQuestionSeconds || 20,
      elapsedSeconds,
      currentStreak: session.streak,
      scoringMethod: game.scoringMethod || 'speed_bonus',
    });

    session.answeredQuestionIndices.add(qIdx);
    session.score += scoreResult.pointsEarned;
    session.streak = scoreResult.newStreak;
    session.bestStreak = Math.max(session.bestStreak, session.streak);
    if (isCorrect && !scoreResult.timedOut) {
      session.correctCount += 1;
    }

    // Prepare timer for next question
    session.currentQuestionIndex = qIdx + 1;
    session.questionStartedAtMs = Date.now();

    const isLastQuestion = session.answeredQuestionIndices.size >= questionsFull.length;
    let xpEarned = 0;

    if (isLastQuestion) {
      session.completed = true;
      const accuracyRatio = questionsFull.length > 0 ? session.correctCount / questionsFull.length : 0;
      xpEarned = Math.round((game.xpReward || 150) * Math.max(0.25, accuracyRatio));

      user.stats.totalPoints += session.score;
      user.stats.totalXp += xpEarned;
      user.stats.gamesPlayed += 1;
      if (accuracyRatio >= 0.6) {
        user.stats.gamesWon += 1;
      }
      user.stats.correctAnswers += session.correctCount;
      user.stats.totalAnswers += questionsFull.length;
      user.stats.accuracyPercent =
        user.stats.totalAnswers > 0
          ? Math.round((user.stats.correctAnswers / user.stats.totalAnswers) * 100)
          : 0;
      user.stats.currentStreak = session.streak;
      user.stats.bestStreak = Math.max(user.stats.bestStreak, session.bestStreak);

      const distinctWatchedCount = new Set(
        db.playbackProgress.filter((p) => p.userId === user.uid).map((p) => p.contentId)
      ).size;
      const unlocked = evaluateNewAchievements(user, distinctWatchedCount, db.achievements);
      for (const ach of unlocked) {
        user.achievements.push(ach.achievementId);
        user.stats.totalXp += ach.xpBonus;
      }

      user.recentActivity.unshift({
        id: `act_${Date.now()}`,
        type: 'game',
        title: `Përfundoi lojën: ${game.title}`,
        timestamp: new Date().toISOString(),
        detail: `${session.score} pikë · +${xpEarned} XP`,
      });
      user.recentActivity = user.recentActivity.slice(0, 25);

      syncLeaderboardForUser(user);
      store.commit();
    }

    res.json({
      isCorrect: isCorrect && !scoreResult.timedOut,
      timedOut: scoreResult.timedOut,
      correctChoiceIndex: question.correctChoiceIndex,
      explanation: question.explanation,
      pointsEarned: scoreResult.pointsEarned,
      totalScore: session.score,
      streak: session.streak,
      correctCount: session.correctCount,
      completed: session.completed,
      xpEarned,
    });
  });

  // =========================================================
  // 5. LOCAL MULTIPLAYER (PHONE AS CONTROLLER) & WEBSOCKETS
  // =========================================================

  const wss = new WebSocketServer({ server, path: '/ws' });
  const roomSockets = new Map<string, Set<WebSocket>>();

  function sanitizeRoomForBroadcast(room: MultiplayerRoom) {
    return {
      roomCode: room.roomCode,
      gameId: room.gameId,
      gameTitle: room.gameTitle,
      hostUserId: room.hostUserId,
      status: room.status,
      maxPlayers: room.maxPlayers,
      currentQuestionIndex: room.currentQuestionIndex,
      questionStartedAt: room.questionStartedAt,
      questionDeadlineAt: room.questionDeadlineAt,
      players: room.players,
      currentQuestionPublic: room.currentQuestionPublic,
      revealedCorrectIndex: room.status === 'reveal' ? room.revealedCorrectIndex : null,
      revealedExplanation: room.status === 'reveal' ? room.revealedExplanation : null,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    };
  }

  function broadcastRoomState(roomCode: string, eventType = 'room:state') {
    const db = store.getState();
    const room = db.multiplayerRooms.find((r) => r.roomCode === roomCode);
    if (!room) return;
    const sockets = roomSockets.get(roomCode);
    if (!sockets) return;

    const message = JSON.stringify({
      type: eventType,
      room: sanitizeRoomForBroadcast(room),
    });

    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  function broadcastSupportUpdate(payload: {
    event: string;
    ticketId?: string;
    userId?: string;
  }) {
    const message = JSON.stringify({
      type: 'support:update',
      ...payload,
      timestamp: Date.now(),
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  wss.on('connection', (ws) => {
    let joinedRoomCode: string | null = null;
    let joinedPlayerId: string | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'room:subscribe') {
          const roomCode = String(msg.roomCode || '').trim();
          joinedRoomCode = roomCode;
          joinedPlayerId = msg.playerId ? String(msg.playerId) : null;

          if (!roomSockets.has(roomCode)) {
            roomSockets.set(roomCode, new Set());
          }
          roomSockets.get(roomCode)!.add(ws);

          const db = store.getState();
          const room = db.multiplayerRooms.find((r) => r.roomCode === roomCode);
          if (room && joinedPlayerId) {
            const p = room.players.find((pl) => pl.playerId === joinedPlayerId);
            if (p) {
              p.connected = true;
              store.commit();
            }
          }
          broadcastRoomState(roomCode, 'room:state');
        }
      } catch {
        // Ignore malformed ws messages
      }
    });

    ws.on('close', () => {
      if (joinedRoomCode) {
        const set = roomSockets.get(joinedRoomCode);
        if (set) {
          set.delete(ws);
        }
        if (joinedPlayerId) {
          const db = store.getState();
          const room = db.multiplayerRooms.find((r) => r.roomCode === joinedRoomCode);
          if (room) {
            const p = room.players.find((pl) => pl.playerId === joinedPlayerId);
            if (p) {
              p.connected = false;
              store.commit();
              broadcastRoomState(joinedRoomCode, 'player:disconnected');
            }
          }
        }
      }
    });
  });

  // Create Multiplayer Room (Host)
  app.post('/api/multiplayer/rooms', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { gameId } = req.body || {};
    const db = store.getState();
    const user = req.user!;
    const game = db.games.find((g) => g.gameId === gameId);

    if (!game) {
      res.status(404).json({ error: 'Loja nuk u gjet.' });
      return;
    }

    const accessCheck = evaluateGameAccess(user, game, 'multiplayer');
    if (!accessCheck.allowed) {
      res.status(403).json({
        error: accessCheck.messageSq || 'Kjo lojë nuk është e përfshirë në aksesin tënd.',
      });
      return;
    }

    const questions = db.gameQuestions.filter((q) => q.gameId === game.gameId);
    if (questions.length === 0) {
      res.status(400).json({ error: 'Kjo lojë nuk ka ende pyetje për multiplayer.' });
      return;
    }

    const roomCode = crypto.randomInt(100000, 999999).toString();
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 2 * 3600_000).toISOString();

    const room: MultiplayerRoom = {
      roomCode,
      gameId: game.gameId,
      gameTitle: game.title,
      hostUserId: user.uid,
      status: 'lobby',
      maxPlayers: game.maxPlayers || 12,
      currentQuestionIndex: -1,
      players: [],
      currentQuestionPublic: null,
      revealedCorrectIndex: null,
      revealedExplanation: null,
      createdAt: nowIso,
      expiresAt: expiresIso,
    };

    db.multiplayerRooms.unshift(room);
    store.commit();

    const origin =
      req.headers.origin ||
      (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL
        : `http://${req.headers.host || 'localhost:3000'}`);
    const controllerUrl = `${origin}/controller/${roomCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(controllerUrl, {
      width: 280,
      margin: 1,
      color: { dark: '#0B0B0D', light: '#F4F0E8' },
    });

    res.status(201).json({
      room: sanitizeRoomForBroadcast(room),
      controllerUrl,
      qrCodeDataUrl,
    });
  });

  // Get Room State + QR Code (accessible to both host and mobile guest controllers)
  app.get('/api/multiplayer/rooms/:roomCode', async (req, res) => {
    const roomCode = String(req.params.roomCode || '').trim();
    const db = store.getState();
    const room = db.multiplayerRooms.find((r) => r.roomCode === roomCode);
    if (!room || room.status === 'terminated') {
      res.status(404).json({ error: 'Dhoma e lojës nuk u gjet ose ka përfunduar.' });
      return;
    }

    const origin =
      req.headers.origin ||
      (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL
        : `http://${req.headers.host || 'localhost:3000'}`);
    const controllerUrl = `${origin}/controller/${roomCode}`;
    const qrCodeDataUrl = await QRCode.toDataURL(controllerUrl, {
      width: 280,
      margin: 1,
      color: { dark: '#0B0B0D', light: '#F4F0E8' },
    });

    res.json({
      room: sanitizeRoomForBroadcast(room),
      controllerUrl,
      qrCodeDataUrl,
    });
  });

  // Join Room as Guest Controller (No account registration needed; temporary room-scoped identity)
  app.post('/api/multiplayer/rooms/:roomCode/join', (req, res) => {
    const roomCode = String(req.params.roomCode || '').trim();
    const { nickname, avatar, existingPlayerId } = req.body || {};
    const cleanNick = String(nickname || '').trim().slice(0, 24);

    if (!cleanNick) {
      res.status(400).json({ error: 'Ju lutem shkruani një pseudonim për të hyrë në lojë.' });
      return;
    }

    const db = store.getState();
    const room = db.multiplayerRooms.find((r) => r.roomCode === roomCode);
    if (!room || room.status === 'terminated') {
      res.status(404).json({ error: 'Dhoma e lojës nuk u gjet ose ka përfunduar.' });
      return;
    }

    // Reconnect existing player if applicable
    if (existingPlayerId) {
      const existing = room.players.find((p) => p.playerId === existingPlayerId);
      if (existing) {
        existing.connected = true;
        existing.nickname = cleanNick;
        store.commit();
        broadcastRoomState(roomCode, 'player:reconnected');
        res.json({ player: existing, room: sanitizeRoomForBroadcast(room) });
        return;
      }
    }

    if (room.players.length >= room.maxPlayers) {
      res.status(400).json({ error: 'Dhoma e lojës ka arritur numrin maksimal të lojtarëve.' });
      return;
    }

    const player: MultiplayerPlayer = {
      playerId: `guest_${crypto.randomBytes(6).toString('hex')}`,
      nickname: cleanNick,
      avatar: String(avatar || 'eagle'),
      score: 0,
      streak: 0,
      correctCount: 0,
      connected: true,
      lastAnsweredQuestionIndex: -1,
      joinedAt: new Date().toISOString(),
    };

    room.players.push(player);
    store.commit();
    broadcastRoomState(roomCode, 'player:joined');

    res.status(201).json({
      player,
      room: sanitizeRoomForBroadcast(room),
    });
  });

  // Host Controls: Start Game / Next Question / Reveal Answer / Finish
  app.post('/api/multiplayer/rooms/:roomCode/host-action', requireAuth, (req: AuthenticatedRequest, res) => {
    const roomCode = String(req.params.roomCode || '').trim();
    const { action } = req.body || {}; // 'start' | 'reveal' | 'next' | 'terminate'
    const db = store.getState();
    const room = db.multiplayerRooms.find((r) => r.roomCode === roomCode);

    if (!room) {
      res.status(404).json({ error: 'Dhoma nuk u gjet.' });
      return;
    }

    if (room.hostUserId !== req.user!.uid && req.user!.role !== 'super_admin') {
      res.status(403).json({ error: 'Vetëm drejtuesi i dhomës mund të kontrollojë lojën.' });
      return;
    }

    const game = db.games.find((g) => g.gameId === room.gameId);
    const questions = db.gameQuestions
      .filter((q) => q.gameId === room.gameId)
      .sort((a, b) => a.order - b.order);

    const loadQuestionAtIndex = (idx: number) => {
      const q = questions[idx];
      if (!q) {
        room.status = 'finished';
        room.currentQuestionPublic = null;
        return;
      }
      const timeLimit = q.timeLimitSeconds || game?.timePerQuestionSeconds || 20;
      const nowMs = Date.now();
      room.status = 'question';
      room.currentQuestionIndex = idx;
      room.questionStartedAt = nowMs;
      room.questionDeadlineAt = nowMs + timeLimit * 1000;
      room.revealedCorrectIndex = null;
      room.revealedExplanation = null;
      room.currentQuestionPublic = {
        questionId: q.questionId,
        gameId: q.gameId,
        order: q.order,
        questionText: q.questionText,
        imageUrl: q.imageUrl,
        audioUrl: q.audioUrl,
        choices: q.choices,
        timeLimitSeconds: timeLimit,
        points: q.points || 100,
      };
    };

    if (action === 'start') {
      loadQuestionAtIndex(0);
    } else if (action === 'reveal') {
      const q = questions[room.currentQuestionIndex];
      if (q) {
        room.status = 'reveal';
        room.revealedCorrectIndex = q.correctChoiceIndex;
        room.revealedExplanation = q.explanation;
      }
    } else if (action === 'next') {
      const nextIdx = room.currentQuestionIndex + 1;
      if (nextIdx >= questions.length) {
        room.status = 'finished';
        room.currentQuestionPublic = null;
      } else {
        loadQuestionAtIndex(nextIdx);
      }
    } else if (action === 'terminate') {
      room.status = 'terminated';
    }

    store.commit();
    broadcastRoomState(roomCode, `room:${action}`);
    res.json({ room: sanitizeRoomForBroadcast(room) });
  });

  // Mobile Phone Controller Answer Submission
  app.post('/api/multiplayer/rooms/:roomCode/answer', (req, res) => {
    const roomCode = String(req.params.roomCode || '').trim();
    const { playerId, choiceIndex } = req.body || {};
    const db = store.getState();
    const room = db.multiplayerRooms.find((r) => r.roomCode === roomCode);

    if (!room || room.status !== 'question') {
      res.status(400).json({ error: 'Pyetja është mbyllur ose loja nuk është në gjendje aktive.' });
      return;
    }

    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) {
      res.status(403).json({ error: 'Lojtari nuk është pjesë e kësaj dhome.' });
      return;
    }

    if (player.lastAnsweredQuestionIndex === room.currentQuestionIndex) {
      res.status(400).json({ error: 'Keni dërguar tashmë përgjigjen për këtë pyetje.' });
      return;
    }

    const nowMs = Date.now();
    if (room.questionDeadlineAt && nowMs > room.questionDeadlineAt + 1500) {
      res.status(400).json({ error: 'Koha për këtë pyetje ka përfunduar.' });
      return;
    }

    const questions = db.gameQuestions
      .filter((q) => q.gameId === room.gameId)
      .sort((a, b) => a.order - b.order);
    const q = questions[room.currentQuestionIndex];
    const game = db.games.find((g) => g.gameId === room.gameId);

    if (!q) {
      res.status(404).json({ error: 'Pyetja nuk u gjet.' });
      return;
    }

    const elapsedSeconds = room.questionStartedAt ? Math.max(0, (nowMs - room.questionStartedAt) / 1000) : 5;
    const isCorrect = Number(choiceIndex) === q.correctChoiceIndex;

    const scoreRes = calculateQuestionScore({
      isCorrect,
      basePoints: q.points || 100,
      timeLimitSeconds: q.timeLimitSeconds || game?.timePerQuestionSeconds || 20,
      elapsedSeconds,
      currentStreak: player.streak,
      scoringMethod: game?.scoringMethod || 'speed_bonus',
    });

    player.lastAnsweredQuestionIndex = room.currentQuestionIndex;
    player.lastAnswerCorrect = isCorrect && !scoreRes.timedOut;
    player.lastPointsEarned = scoreRes.pointsEarned;
    player.score += scoreRes.pointsEarned;
    player.streak = scoreRes.newStreak;
    if (player.lastAnswerCorrect) {
      player.correctCount += 1;
    }

    // Auto-reveal if all connected players have answered
    const allAnswered =
      room.players.length > 0 &&
      room.players.every((p) => p.lastAnsweredQuestionIndex === room.currentQuestionIndex);
    if (allAnswered) {
      room.status = 'reveal';
      room.revealedCorrectIndex = q.correctChoiceIndex;
      room.revealedExplanation = q.explanation;
    }

    store.commit();
    broadcastRoomState(roomCode, 'player:answered');

    res.json({
      accepted: true,
      roomStatus: room.status,
    });
  });

  // =========================================================
  // 6. LEADERBOARDS & USER PROFILE
  // =========================================================

  app.get('/api/leaderboard', requireAuth, (req: AuthenticatedRequest, res) => {
    const scope = String(req.query.scope || 'global') as
      | 'global'
      | 'weekly'
      | 'monthly'
      | 'country'
      | 'school';
    const filterValue = req.query.filter ? String(req.query.filter) : undefined;
    const db = store.getState();

    const sorted = sortLeaderboardEntries(db.leaderboardEntries, scope, filterValue);
    res.json({
      entries: sorted,
      schoolRankingsEnabled: db.siteSettings.schoolRankingsEnabled,
      achievements: db.achievements,
    });
  });

  app.put('/api/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { displayName, avatar, country, school } = req.body || {};
    if (displayName && String(displayName).trim().length >= 2) {
      user.displayName = String(displayName).trim().slice(0, 60);
    }
    if (avatar) {
      user.avatar = String(avatar).slice(0, 32);
    }
    if (country) {
      user.stats.country = String(country).trim().slice(0, 60);
    }
    if (school !== undefined) {
      user.stats.school = String(school).trim().slice(0, 100);
    }

    syncLeaderboardForUser(user);
    store.commit();
    res.json({ user: sanitizeUser(user) });
  });

  // =========================================================
  // 7. SUPER ADMIN PANEL APIS (STRICTLY SUPER ADMIN ONLY)
  // =========================================================

  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    await store.syncFromCloud();
    ensureGoogleDriveCatalogState();
    const db = store.getState();
    const nowMs = Date.now();

    const regularUsers = db.users.filter((u) => u.role !== 'super_admin');
    const activeUsersCount = regularUsers.filter(
      (u) => u.status === 'active' && evaluateAccountTimeAccess(u, nowMs).allowed
    ).length;
    const expiredUsersCount = regularUsers.filter(
      (u) => u.status === 'expired' || !evaluateAccountTimeAccess(u, nowMs).allowed
    ).length;

    const publishedContent = db.content.filter((c) => c.publicationStatus === 'published');
    const draftContent = db.content.filter((c) => c.publicationStatus === 'draft');

    const shortsList = db.content.filter((c) => c.videoFormat === 'short');
    const standardList = db.content.filter((c) => c.videoFormat === 'standard');

    const totalShortsViews = shortsList.reduce((sum, c) => sum + (c.viewsCount || 0), 0);
    const totalStandardViews = standardList.reduce((sum, c) => sum + (c.viewsCount || 0), 0);

    const totalShortsWatchSec = shortsList.reduce(
      (sum, c) => sum + (c.totalWatchDurationSeconds || 0),
      0
    );
    const averageShortsWatchDurationSeconds =
      totalShortsViews > 0 ? Math.round(totalShortsWatchSec / totalShortsViews) : 0;

    const standardProgressRecords = db.playbackProgress.filter((p) => p.videoFormat === 'standard');
    const averageStandardCompletionPercent =
      standardProgressRecords.length > 0
        ? Math.round(
            standardProgressRecords.reduce((sum, p) => sum + (p.completionPercent || 0), 0) /
              standardProgressRecords.length
          )
        : 0;

    const dualVideoAnalytics: DualVideoAnalytics = {
      totalShortsUploads: shortsList.length,
      totalStandardUploads: standardList.length,
      totalShortsViews,
      totalStandardViews,
      averageShortsWatchDurationSeconds,
      averageStandardCompletionPercent,
      mostViewedShorts: [...shortsList]
        .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0))
        .slice(0, 5)
        .map((c) => ({
          contentId: c.contentId,
          title: c.title,
          viewsCount: c.viewsCount || 0,
          likesCount: c.likesCount || 0,
          avgWatchSeconds:
            c.viewsCount > 0 ? Math.round((c.totalWatchDurationSeconds || 0) / c.viewsCount) : 0,
          aspectRatio: c.aspectRatio,
          resolution: c.resolution,
        })),
      mostViewedStandardVideos: [...standardList]
        .sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0))
        .slice(0, 5)
        .map((c) => ({
          contentId: c.contentId,
          title: c.title,
          viewsCount: c.viewsCount || 0,
          completionCount: c.completionCount || 0,
          avgCompletionPercent: averageStandardCompletionPercent,
          resolution: c.resolution,
        })),
    };

    res.json({
      stats: {
        publishedContentCount: publishedContent.length,
        draftContentCount: draftContent.length,
        totalUsersCount: regularUsers.length,
        activeUsersCount,
        expiredUsersCount,
        totalGamesCount: db.games.length,
        completedGameSessionsCount: regularUsers.reduce((s, u) => s + (u.stats.gamesPlayed || 0), 0),
        totalStreamingViews: totalShortsViews + totalStandardViews,
        activeMultiplayerRoomsCount: db.multiplayerRooms.filter((r) => r.status !== 'terminated' && r.status !== 'finished').length,
      },
      dualVideoAnalytics,
      content: db.content,
      categories: db.categories,
      episodes: db.episodes,
      mediaAssets: db.mediaAssets,
      games: db.games,
      gameQuestions: db.gameQuestions,
      users: regularUsers.map(sanitizeUser),
      multiplayerRooms: db.multiplayerRooms,
      leaderboardEntries: db.leaderboardEntries,
      auditLogs: db.auditLogs.slice(0, 100),
      siteSettings: db.siteSettings,
      supportTickets: getCleanActiveSupportTickets(db),
      bannedDevices: db.bannedDevices || [],
    });
  });

  // Admin: Google Drive Folder Config & Sync (All videos & covers come exclusively from Google Drive)
  app.get('/api/admin/drive/config', requireAdmin, (_req, res) => {
    ensureGoogleDriveCatalogState();
    const db = store.getState();
    res.json({
      folderId: db.siteSettings.googleDriveFolderId || DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
      folderUrl: db.siteSettings.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER_URL,
      lastDriveSyncAt: db.siteSettings.lastDriveSyncAt || null,
      contentCount: db.content.length,
    });
  });

  app.post('/api/admin/drive/sync', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    const db = store.getState();
    const nowIso = new Date().toISOString();

    const folderInput = String(
      body.folderUrlOrId ||
        db.siteSettings.googleDriveFolderUrl ||
        DEFAULT_GOOGLE_DRIVE_FOLDER_URL
    ).trim();
    const folderId = extractDriveFolderId(folderInput);
    const folderUrl = folderInput.startsWith('http')
      ? folderInput
      : `https://drive.google.com/drive/folders/${folderId}?usp=drive_link`;

    db.siteSettings.googleDriveFolderId = folderId;
    db.siteSettings.googleDriveFolderUrl = folderUrl;
    db.siteSettings.lastDriveSyncAt = nowIso;

    const accessToken =
      String(req.headers['x-google-access-token'] || body.accessToken || '').trim() ||
      (req.headers.authorization?.startsWith('Bearer ya29.')
        ? req.headers.authorization.replace('Bearer ', '').trim()
        : '') ||
      String(db.siteSettings.googleDriveAccessToken || '').trim();

    if (accessToken) {
      db.siteSettings.googleDriveAccessToken = accessToken;
    }

    let syncedFromApiCount = 0;

    if (accessToken) {
      try {
        // List files directly inside the target Google Drive folder (and up to 1 level of subfolders)
        const listDriveFolderFiles = async (parentFolderId: string) => {
          const q = encodeURIComponent(`'${parentFolderId}' in parents and trashed = false`);
          const fields = encodeURIComponent(
            'files(id,name,mimeType,size,videoMediaMetadata,thumbnailLink,webContentLink,modifiedTime)'
          );
          const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok) {
            return [] as Array<any>;
          }
          const json: any = await resp.json();
          return Array.isArray(json.files) ? json.files : [];
        };

        const searchNamedDriveFolders = async (folderNameQuery: string) => {
          const q = encodeURIComponent(
            `mimeType = 'application/vnd.google-apps.folder' and name contains '${folderNameQuery}' and trashed = false`
          );
          const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`;
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok) return [] as Array<{ id: string; name: string }>;
          const json: any = await resp.json();
          return Array.isArray(json.files) ? json.files : [];
        };

        const topFiles = await listDriveFolderFiles(folderId);
        const allFiles: Array<any> = [...topFiles];
        for (const f of topFiles) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            const subFiles = await listDriveFolderFiles(f.id);
            allFiles.push(...subFiles);
          }
        }

        // Also look for any folder named "MITO content" or "MITO" in the user's Google Drive
        const mitoFolders = await searchNamedDriveFolders('MITO');
        for (const mf of mitoFolders) {
          if (mf.id && mf.id !== folderId) {
            const mfFiles = await listDriveFolderFiles(mf.id);
            for (const item of mfFiles) {
              if (!allFiles.some((existing) => existing.id === item.id)) {
                allFiles.push(item);
              }
            }
          }
        }

        const videoFiles = allFiles.filter(
          (f) =>
            String(f.mimeType || '').startsWith('video/') ||
            /\.(mp4|mov|m4v|webm)$/i.test(String(f.name || ''))
        );
        const imageFiles = allFiles.filter(
          (f) =>
            String(f.mimeType || '').startsWith('image/') ||
            /\.(png|jpg|jpeg|webp)$/i.test(String(f.name || ''))
        );

        // Pre-fetch image covers as base64 data URLs
        const coverByStem = new Map<string, { fileId: string; dataUrl: string }>();
        let fallbackCover: { fileId: string; dataUrl: string } | null = null;

        for (const img of imageFiles) {
          try {
            const imgResp = await fetch(
              `https://www.googleapis.com/drive/v3/files/${img.id}?alt=media&supportsAllDrives=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (imgResp.ok) {
              const arrBuf = await imgResp.arrayBuffer();
              const buf = Buffer.from(arrBuf);
              if (buf.length > 0 && buf.length < 8 * 1024 * 1024) {
                const mime = String(img.mimeType || 'image/jpeg').startsWith('image/')
                  ? String(img.mimeType)
                  : 'image/jpeg';
                const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
                const stem = String(img.name || '')
                  .replace(/\.[^.]+$/, '')
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '');
                const entry = { fileId: String(img.id), dataUrl };
                if (stem) coverByStem.set(stem, entry);
                if (!fallbackCover) fallbackCover = entry;
              }
            }
          } catch {
            // Ignore single cover download error
          }
        }

        for (const vf of videoFiles) {
          const driveVideoFileId = String(vf.id);
          const rawName = String(vf.name || 'Filmi nga Google Drive.mp4');
          const cleanTitle =
            rawName
              .replace(/\.[^.]+$/, '')
              .replace(/[_-]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim() || 'Filmi nga Google Drive';
          const stem = rawName
            .replace(/\.[^.]+$/, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');

          // Check if we already have this video by driveVideoFileId or matching title/filename
          let existingContent = db.content.find(
            (c) =>
              c.driveVideoFileId === driveVideoFileId ||
              c.title.toLowerCase() === cleanTitle.toLowerCase() ||
              path.basename(c.storagePath).toLowerCase().includes(stem.slice(0, 14)) ||
              (c.contentId === 'cnt_1793701774719_0bebb6e7' &&
                (cleanTitle.toLowerCase().includes('besa') || videoFiles.length === 1))
          );

          const matchedCover = coverByStem.get(stem) || fallbackCover;

          if (existingContent) {
            existingContent.driveFolderId = folderId;
            existingContent.driveFolderUrl = folderUrl;
            existingContent.driveVideoFileId = driveVideoFileId;
            existingContent.lastDriveSyncAt = nowIso;
            if (matchedCover) {
              existingContent.driveCoverFileId = matchedCover.fileId;
              existingContent.thumbnailUrl = matchedCover.dataUrl;
              existingContent.posterUrl = matchedCover.dataUrl;
              existingContent.heroUrl = matchedCover.dataUrl;
            }
            existingContent.watchToUnlock = {
              enabled: false,
              requiredCompletionPercent: 0,
              mandatoryForAllGames: false,
            };

            // Also download the actual video stream from Google Drive onto existingContent's storagePath
            try {
              const targetDiskPath = path.join(UPLOADS_DIR, path.basename(existingContent.storagePath));
              const vidResp = await fetch(
                `https://www.googleapis.com/drive/v3/files/${driveVideoFileId}?alt=media&supportsAllDrives=true`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (vidResp.ok) {
                const ab = await vidResp.arrayBuffer();
                const vidBuf = Buffer.from(ab);
                if (vidBuf.length > 500000) {
                  fs.writeFileSync(targetDiskPath, vidBuf);
                  existingContent.fileSizeBytes = vidBuf.length;
                  const matchingAsset = db.mediaAssets.find(
                    (a) => a.storagePath === existingContent!.storagePath
                  );
                  if (matchingAsset) {
                    matchingAsset.fileSizeBytes = vidBuf.length;
                    await store.saveMediaFileToCloud(matchingAsset.assetId, targetDiskPath);
                  }
                }
              }
            } catch {
              // Keep existing playable file on disk if Drive stream fetch fails
            }

            syncedFromApiCount++;
            continue;
          }

          // Download new video file from Google Drive
          const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const assetId = `media_drive_${driveVideoFileId.slice(0, 12)}`;
          const storageFilename = `${assetId}_${safeFilename.endsWith('.mp4') ? safeFilename : `${safeFilename}.mp4`}`;
          const diskPath = path.join(UPLOADS_DIR, storageFilename);

          if (!fs.existsSync(diskPath) || fs.statSync(diskPath).size < 4096) {
            const vidResp = await fetch(
              `https://www.googleapis.com/drive/v3/files/${driveVideoFileId}?alt=media&supportsAllDrives=true`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (vidResp.ok) {
              const ab = await vidResp.arrayBuffer();
              fs.writeFileSync(diskPath, Buffer.from(ab));
            }
          }

          if (fs.existsSync(diskPath) && fs.statSync(diskPath).size >= 1024) {
            const inspected = inspectAndOptimizeUploadedVideo(diskPath, 'standard');
            const fileSizeBytes = fs.statSync(diskPath).size;
            const isVertical916 = Math.abs(inspected.aspectRatio - 9 / 16) <= 0.08;
            const contentId = `cnt_drive_${driveVideoFileId.slice(0, 12)}`;
            const thumbUrl =
              matchedCover?.dataUrl ||
              inspected.autoThumbnailUrl ||
              '/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png';

            const asset: MediaAsset = {
              assetId,
              filename: rawName,
              mimeType: 'video/mp4',
              fileSizeBytes,
              videoFormat: isVertical916 ? 'short' : 'standard',
              width: inspected.width,
              height: inspected.height,
              aspectRatio: inspected.aspectRatio,
              durationSeconds: inspected.durationSeconds,
              resolution: inspected.resolution,
              codec: inspected.codec,
              audioCodec: inspected.audioCodec,
              storagePath: `/uploads/${storageFilename}`,
              publicUrl: `/api/media/file/${assetId}`,
              autoThumbnailUrl: thumbUrl,
              processingStatus: 'ready',
              uploadStatus: 'ready',
              relatedContentId: contentId,
              driveFileId: driveVideoFileId,
              driveFolderId: folderId,
              uploadedByUid: req.user!.uid,
              createdAt: nowIso,
              updatedAt: nowIso,
            };

            const newContent: VideoContent = {
              contentId,
              title: cleanTitle,
              slug:
                cleanTitle
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '') || contentId,
              synopsis: `${cleanTitle} — sinkronizuar nga dosja zyrtare e Google Drive në MITO.`,
              description: `${cleanTitle} — përmbajtje origjinale e ngarkuar përmes dosjes Google Drive të platformës MITO.`,
              type: 'legend',
              videoFormat: isVertical916 ? 'short' : 'standard',
              videoContainer: 'mp4',
              aspectRatio: inspected.aspectRatio,
              width: inspected.width,
              height: inspected.height,
              durationSeconds: inspected.durationSeconds,
              resolution: inspected.resolution,
              codec: inspected.codec,
              audioCodec: inspected.audioCodec,
              fileSizeBytes,
              storagePath: `/uploads/${storageFilename}`,
              thumbnailUrl: thumbUrl,
              posterUrl: thumbUrl,
              heroUrl: thumbUrl,
              playbackUrl: `/api/media/file/${assetId}`,
              processingStatus: 'ready',
              uploadStatus: 'ready',
              captions: [],
              publicationStatus: 'published',
              relatedStoryIds: [],
              relatedGameIds: db.games.map((g) => g.gameId).slice(0, 1),
              categoryIds: db.categories.length > 0 ? [db.categories[0].categoryId] : ['cat_legjenda'],
              tags: ['google-drive', 'film', 'shqip', 'mito'],
              language: 'Shqip',
              region: 'Shqipëri',
              featured: true,
              cropMode: 'preserve',
              creatorAttribution: 'MITO Google Drive Archive',
              driveFolderId: folderId,
              driveFolderUrl: folderUrl,
              driveVideoFileId,
              driveCoverFileId: matchedCover?.fileId,
              lastDriveSyncAt: nowIso,
              watchToUnlock: {
                enabled: false,
                requiredCompletionPercent: 0,
                mandatoryForAllGames: false,
              },
              provenance: {
                sourceReferences: 'Google Drive Folder Sync',
                bibliography: 'Arkivi Dixhital MITO',
                storyteller: 'MITO Archive',
                regionOfOrigin: 'Shqipëri',
                dialect: 'Shqip',
                recordingDate: nowIso.slice(0, 10),
                consentStatus: 'verified',
                rightsAndLicensing: 'MITO Heritage License',
                editorialNotes: `Sinkronizuar nga Google Drive (${folderId}).`,
                verifiedHistoricalFact: true,
              },
              viewsCount: 0,
              likesCount: 0,
              savesCount: 0,
              totalWatchDurationSeconds: 0,
              completionCount: 0,
              createdAt: nowIso,
              updatedAt: nowIso,
              publishedAt: nowIso,
            };

            store.unmarkDeleted([assetId, contentId]);
            db.mediaAssets = db.mediaAssets.filter((a) => a.assetId !== assetId);
            db.mediaAssets.unshift(asset);
            db.content = db.content.filter((c) => c.contentId !== contentId);
            db.content.unshift(newContent);
            await store.saveMediaFileToCloud(assetId, diskPath);
            syncedFromApiCount++;
          }
        }
      } catch (err) {
        console.warn('[MITO Drive Sync] Live Drive API fetch warning:', err);
      }
    }

    // Ensure Google Drive catalog state & remove any non-Drive demo uploads
    ensureGoogleDriveCatalogState();

    // Remove any content item that does not belong to the Google Drive folder
    const nonDriveContent = db.content.filter(
      (c) =>
        !c.driveFolderId &&
        c.contentId !== 'cnt_1793701774719_0bebb6e7' &&
        !c.contentId.startsWith('cnt_drive_')
    );
    if (nonDriveContent.length > 0) {
      store.markDeleted(nonDriveContent.map((c) => c.contentId));
      db.content = db.content.filter(
        (c) =>
          Boolean(c.driveFolderId) ||
          c.contentId === 'cnt_1793701774719_0bebb6e7' ||
          c.contentId.startsWith('cnt_drive_')
      );
    }

    // Ensure all synced Google Drive videos are tagged with current folderId and have playable files on disk
    for (const item of db.content) {
      item.driveFolderId = folderId;
      item.driveFolderUrl = folderUrl;
      item.lastDriveSyncAt = nowIso;
      item.watchToUnlock = {
        enabled: false,
        requiredCompletionPercent: 0,
        mandatoryForAllGames: false,
      };
      const asset = db.mediaAssets.find(
        (a) =>
          a.relatedContentId === item.contentId ||
          item.playbackUrl.includes(a.assetId) ||
          a.storagePath === item.storagePath
      );
      if (asset) {
        asset.driveFolderId = folderId;
        await ensurePlayableVideoOnDisk(asset, item);
      }
    }

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'GOOGLE_DRIVE_FOLDER_SYNCED',
      targetId: folderId,
      details: `U sinkronizuan videot dhe kopertinat nga dosja Google Drive (${folderId}). Gjithsej në katalog: ${db.content.length} video.`,
      severity: 'info',
    });

    await store.commitAsync();

    res.json({
      ok: true,
      folderId,
      folderUrl,
      syncedCount: Math.max(syncedFromApiCount, db.content.length),
      content: db.content,
      messageSq: `Sinkronizimi me dosjen e Google Drive (${folderId}) përfundoi me sukses! ${db.content.length} video dhe kopertina janë gati për transmetim.`,
    });
  });

  // Admin: Update / Edit Existing Google Drive Video Metadata, Visibility & Linked Questionnaires
  // Note: Manual creation of new videos without an existing contentId / Drive sync is disabled.
  const handleUpdateDriveContentMetadata = async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const db = store.getState();
    const nowIso = new Date().toISOString();

    const targetContentId = String(req.params.contentId || body.contentId || '').trim();
    const existing = db.content.find((c) => c.contentId === targetContentId);

    if (!existing) {
      res.status(403).json({
        error:
          'Ngarkimi manual i videove nga paneli i administratorit është çaktivizuar. Videot dhe kopertinat shtohen vetëm përmes dosjes së Google Drive, ndërsa këtu mund të editoni videot ekzistuese.',
        code: 'MANUAL_CREATE_DISABLED_USE_GOOGLE_DRIVE',
      });
      return;
    }

    if (body.title !== undefined && String(body.title).trim()) {
      existing.title = String(body.title).trim();
      existing.slug =
        String(body.slug || existing.title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || existing.contentId;
    }
    if (body.synopsis !== undefined) {
      existing.synopsis = String(body.synopsis).slice(0, 600);
    }
    if (body.description !== undefined) {
      existing.description = String(body.description).slice(0, 5000);
    }
    if (body.type !== undefined) {
      existing.type = body.type;
    }
    if (body.videoFormat === 'short' || body.videoFormat === 'standard') {
      existing.videoFormat = body.videoFormat;
    }
    if (body.publicationStatus === 'published' || body.publicationStatus === 'draft') {
      existing.publicationStatus = body.publicationStatus;
      if (body.publicationStatus === 'published' && !existing.publishedAt) {
        existing.publishedAt = nowIso;
      }
    }
    if (body.thumbnailUrl || body.posterUrl) {
      const nextCover = String(body.posterUrl || body.thumbnailUrl).trim();
      if (nextCover) {
        existing.thumbnailUrl = nextCover;
        existing.posterUrl = nextCover;
        existing.heroUrl = String(body.heroUrl || nextCover);
      }
    }
    if (Array.isArray(body.captions)) {
      existing.captions = body.captions;
    }
    if (Array.isArray(body.categoryIds)) {
      existing.categoryIds = body.categoryIds;
    }
    if (Array.isArray(body.tags)) {
      existing.tags = body.tags;
    }
    if (body.region !== undefined) {
      existing.region = String(body.region);
    }
    if (body.language !== undefined) {
      existing.language = String(body.language);
    }
    if (body.featured !== undefined) {
      existing.featured = Boolean(body.featured);
    }
    if (body.creatorAttribution !== undefined) {
      existing.creatorAttribution = String(body.creatorAttribution);
    }
    if (Array.isArray(body.relatedGameIds)) {
      existing.relatedGameIds = body.relatedGameIds.map(String);
      // Sync game.linkedContentId and ensure 0% watch requirement
      db.games.forEach((g) => {
        if (existing.relatedGameIds.includes(g.gameId)) {
          g.linkedContentId = existing.contentId;
          g.requireWatchToUnlock = false;
          g.requiredWatchPercent = 0;
        } else if (g.linkedContentId === existing.contentId) {
          g.linkedContentId = undefined;
        }
      });
    }

    // Always enforce 0% watch requirement on videos per user requirement
    existing.watchToUnlock = {
      enabled: false,
      requiredCompletionPercent: 0,
      mandatoryForAllGames: false,
    };
    existing.updatedAt = nowIso;

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'CONTENT_UPDATED',
      targetId: existing.contentId,
      details: `U përditësua videoja nga Google Drive: "${existing.title}" (${existing.publicationStatus === 'published' ? 'E Shfaqur' : 'E Fshehur'}).`,
      severity: 'info',
    });

    await store.commitAsync();
    res.json({ content: existing });
  };

  app.post('/api/admin/content', requireAdmin, handleUpdateDriveContentMetadata);
  app.put('/api/admin/content/:contentId', requireAdmin, handleUpdateDriveContentMetadata);

  // Admin: Toggle Video Visibility (Hide / Show video in platform)
  app.post('/api/admin/content/:contentId/toggle-visibility', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { contentId } = req.params;
    const db = store.getState();
    const item = db.content.find((c) => c.contentId === contentId);
    if (!item) {
      res.status(404).json({ error: 'Videoja nuk u gjet.' });
      return;
    }
    item.publicationStatus = item.publicationStatus === 'published' ? 'draft' : 'published';
    item.updatedAt = new Date().toISOString();

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'CONTENT_VISIBILITY_TOGGLED',
      targetId: contentId,
      details: `Videoja "${item.title}" tani është: ${item.publicationStatus === 'published' ? 'E SHFAQUR (Published)' : 'E FSHEHUR (Draft)'}.`,
      severity: 'info',
    });

    await store.commitAsync();
    res.json({ ok: true, content: item, publicationStatus: item.publicationStatus });
  });

  const handleDeleteContentById = async (req: AuthenticatedRequest, res: Response) => {
    const { contentId } = req.params;
    const db = store.getState();
    store.markDeleted(contentId);
    const idx = db.content.findIndex((c) => c.contentId === contentId);
    if (idx === -1) {
      await store.commitAsync();
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }
    const removed = db.content.splice(idx, 1)[0];

    // Cascade clean up episodes, playback progress, linked media assets, and references
    const removedEpisodes = db.episodes.filter((e) => e.seriesContentId === contentId);
    store.markDeleted(removedEpisodes.map((e) => e.episodeId));
    db.episodes = db.episodes.filter((e) => e.seriesContentId !== contentId);

    const removedProg = db.playbackProgress.filter((p) => p.contentId === contentId);
    store.markDeleted(removedProg.map((p) => p.progressId));
    db.playbackProgress = db.playbackProgress.filter((p) => p.contentId !== contentId);

    db.content.forEach((c) => {
      if (c.linkedContentId === contentId) c.linkedContentId = undefined;
      c.relatedStoryIds = c.relatedStoryIds.filter((id) => id !== contentId);
    });
    db.games.forEach((g) => {
      if (g.linkedContentId === contentId) {
        g.linkedContentId = undefined;
        g.requireWatchToUnlock = false;
      }
    });
    db.users.forEach((u) => {
      u.likedShortIds = u.likedShortIds.filter((id) => id !== contentId);
      u.savedContentIds = u.savedContentIds.filter((id) => id !== contentId);
    });

    // Also remove media asset exclusively tied to this content
    const linkedAssets = db.mediaAssets.filter(
      (a) =>
        a.relatedContentId === contentId ||
        a.storagePath === removed.storagePath ||
        a.publicUrl === removed.playbackUrl
    );
    for (const asset of linkedAssets) {
      const stillUsedByOther = db.content.some(
        (c) =>
          c.contentId !== contentId &&
          (c.storagePath === asset.storagePath || c.playbackUrl === asset.publicUrl)
      );
      if (!stillUsedByOther) {
        const diskPath = path.join(UPLOADS_DIR, path.basename(asset.storagePath));
        if (fs.existsSync(diskPath)) {
          try {
            fs.unlinkSync(diskPath);
          } catch {
            // Ignore unlink error
          }
        }
        store.markDeleted(asset.assetId);
        db.mediaAssets = db.mediaAssets.filter((a) => a.assetId !== asset.assetId);
      }
    }

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'CONTENT_DELETED',
      targetId: contentId,
      details: `U fshi përmbajtja "${removed.title}".`,
      severity: 'warning',
    });
    await store.commitAsync();
    res.json({ ok: true, deletedContentId: contentId });
  };

  app.delete('/api/admin/content/:contentId', requireAdmin, handleDeleteContentById);
  app.post('/api/admin/content/:contentId/delete', requireAdmin, handleDeleteContentById);

  app.post('/api/admin/content-clear-all', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const db = store.getState();
    const count = db.content.length;
    store.markDeleted([
      ...db.content.map((c) => c.contentId),
      ...db.episodes.map((e) => e.episodeId),
      ...db.playbackProgress.map((p) => p.progressId),
      ...db.mediaAssets.map((a) => a.assetId),
    ]);
    db.content = [];
    db.episodes = [];
    db.playbackProgress = [];
    db.mediaAssets = [];
    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'ALL_CONTENT_DELETED',
      details: `U fshinë të gjitha përmbajtjet (${count} materiale).`,
      severity: 'warning',
    });
    await store.commitAsync();
    res.json({ ok: true, deletedCount: count });
  });

  // Admin: Categories CRUD
  app.post('/api/admin/categories', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { name, slug, description, iconName, order } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'Emri i kategorisë është i detyrueshëm.' });
      return;
    }
    const db = store.getState();
    const categoryId = `cat_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const cat: CategoryItem = {
      categoryId,
      name: String(name).trim(),
      slug:
        String(slug || name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || categoryId,
      description: String(description || ''),
      iconName: String(iconName || 'Compass'),
      order: Number(order ?? db.categories.length + 1),
      createdAt: new Date().toISOString(),
    };
    store.unmarkDeleted(categoryId);
    db.categories.push(cat);
    await store.commitAsync();
    res.status(201).json({ category: cat });
  });

  const handleDeleteCategoryById = async (req: AuthenticatedRequest, res: Response) => {
    const { categoryId } = req.params;
    const db = store.getState();
    store.markDeleted(categoryId);
    db.categories = db.categories.filter((c) => c.categoryId !== categoryId);
    db.content.forEach((c) => {
      c.categoryIds = c.categoryIds.filter((id) => id !== categoryId);
    });
    await store.commitAsync();
    res.json({ ok: true });
  };
  app.delete('/api/admin/categories/:categoryId', requireAdmin, handleDeleteCategoryById);
  app.post('/api/admin/categories/:categoryId/delete', requireAdmin, handleDeleteCategoryById);

  // Admin: Episodes CRUD
  app.post('/api/admin/episodes', requireAdmin, async (req, res) => {
    const body = req.body || {};
    if (!body.seriesContentId || !body.title) {
      res.status(400).json({ error: 'Seria dhe titulli i episodit janë të detyrueshme.' });
      return;
    }
    const db = store.getState();
    const episodeId = `ep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const episode: EpisodeItem = {
      episodeId,
      seriesContentId: String(body.seriesContentId),
      seasonNumber: Number(body.seasonNumber || 1),
      episodeNumber: Number(body.episodeNumber || 1),
      title: String(body.title).trim(),
      synopsis: String(body.synopsis || ''),
      durationSeconds: Number(body.durationSeconds || 600),
      playbackUrl: String(body.playbackUrl || ''),
      thumbnailUrl: String(body.thumbnailUrl || '/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png'),
      publicationStatus: body.publicationStatus || 'published',
      createdAt: new Date().toISOString(),
    };
    store.unmarkDeleted(episodeId);
    db.episodes.push(episode);
    await store.commitAsync();
    res.status(201).json({ episode });
  });

  const handleDeleteEpisodeById = async (req: AuthenticatedRequest, res: Response) => {
    const { episodeId } = req.params;
    const db = store.getState();
    store.markDeleted(episodeId);
    db.episodes = db.episodes.filter((e) => e.episodeId !== episodeId);
    await store.commitAsync();
    res.json({ ok: true });
  };
  app.delete('/api/admin/episodes/:episodeId', requireAdmin, handleDeleteEpisodeById);
  app.post('/api/admin/episodes/:episodeId/delete', requireAdmin, handleDeleteEpisodeById);

  // Admin: Delete Media Asset (also removes any content using this asset so deletion never fails)
  const handleDeleteMediaAssetById = async (req: AuthenticatedRequest, res: Response) => {
    const { assetId } = req.params;
    const db = store.getState();
    store.markDeleted(assetId);
    const asset = db.mediaAssets.find((a) => a.assetId === assetId);
    if (!asset) {
      await store.commitAsync();
      res.json({ ok: true, alreadyDeleted: true });
      return;
    }

    // Remove any content item that was bound to this media asset
    const boundContent = db.content.filter(
      (c) =>
        c.contentId === asset.relatedContentId ||
        c.storagePath === asset.storagePath ||
        c.playbackUrl === asset.publicUrl
    );
    store.markDeleted(boundContent.map((c) => c.contentId));
    db.content = db.content.filter(
      (c) =>
        c.contentId !== asset.relatedContentId &&
        c.storagePath !== asset.storagePath &&
        c.playbackUrl !== asset.publicUrl
    );

    const diskPath = path.join(UPLOADS_DIR, path.basename(asset.storagePath));
    if (fs.existsSync(diskPath)) {
      try {
        fs.unlinkSync(diskPath);
      } catch {
        // Ignore unlink error
      }
    }
    db.mediaAssets = db.mediaAssets.filter((a) => a.assetId !== assetId);
    await store.commitAsync();
    res.json({ ok: true });
  };
  app.delete('/api/admin/media/:assetId', requireAdmin, handleDeleteMediaAssetById);
  app.post('/api/admin/media/:assetId/delete', requireAdmin, handleDeleteMediaAssetById);

  // Admin: Games & Questions Builder
  app.post('/api/admin/games', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    if (!body.title) {
      res.status(400).json({ error: 'Titulli i lojës është i detyrueshëm.' });
      return;
    }
    const db = store.getState();
    const nowIso = new Date().toISOString();
    const gameId = body.gameId || `game_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const questionsInput: Array<Partial<GameQuestionFull>> = Array.isArray(body.questions)
      ? body.questions
      : [];

    const game: GameItem = {
      gameId,
      title: String(body.title).trim(),
      description: String(body.description || ''),
      coverImageUrl: String(body.coverImageUrl || '/assets/aistudio/MITO__Albanian_Heritage_Streaming_Platform-1_e77724ca.png'),
      instructions: String(body.instructions || 'Përgjigju saktë dhe shpejt për të fituar pikë dhe XP.'),
      gameType: body.gameType || 'quiz_battle',
      difficulty: body.difficulty || 'mesatare',
      maxPlayers: Number(body.maxPlayers || 12),
      questionCount: questionsInput.length || Number(body.questionCount || 0),
      timePerQuestionSeconds: Number(body.timePerQuestionSeconds || 20),
      scoringMethod: body.scoringMethod || 'speed_bonus',
      xpReward: Number(body.xpReward || 200),
      categoryId: body.categoryId ? String(body.categoryId) : undefined,
      linkedContentId: body.linkedContentId ? String(body.linkedContentId) : undefined,
      requireWatchToUnlock: false,
      requiredWatchPercent: 0,
      challengePeriod: body.challengePeriod || 'none',
      publicationStatus: body.publicationStatus || 'published',
      playsCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.unmarkDeleted(gameId);
    const existingIdx = db.games.findIndex((g) => g.gameId === gameId);
    if (existingIdx >= 0) {
      game.playsCount = db.games[existingIdx].playsCount;
      game.createdAt = db.games[existingIdx].createdAt;
      db.games[existingIdx] = game;
    } else {
      db.games.unshift(game);
    }

    if (questionsInput.length > 0) {
      const oldQuestions = db.gameQuestions.filter((q) => q.gameId === gameId);
      store.markDeleted(oldQuestions.map((q) => q.questionId));
      db.gameQuestions = db.gameQuestions.filter((q) => q.gameId !== gameId);
      questionsInput.forEach((q, idx) => {
        const questionId = q.questionId || `q_${gameId}_${idx + 1}`;
        store.unmarkDeleted(questionId);
        db.gameQuestions.push({
          questionId,
          gameId,
          order: idx + 1,
          questionText: String(q.questionText || '').trim(),
          imageUrl: q.imageUrl ? String(q.imageUrl) : undefined,
          audioUrl: q.audioUrl ? String(q.audioUrl) : undefined,
          choices: Array.isArray(q.choices) && q.choices.length >= 2 ? q.choices.map(String) : ['Po', 'Jo'],
          correctChoiceIndex: Number(q.correctChoiceIndex ?? 0),
          timeLimitSeconds: Number(q.timeLimitSeconds || game.timePerQuestionSeconds || 20),
          points: Number(q.points || 100),
          explanation: String(q.explanation || ''),
        });
      });
      game.questionCount = questionsInput.length;
    }

    // Link game ID on linked content if set
    if (game.linkedContentId) {
      const cnt = db.content.find((c) => c.contentId === game.linkedContentId);
      if (cnt && !cnt.relatedGameIds.includes(gameId)) {
        cnt.relatedGameIds.push(gameId);
      }
    }

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: existingIdx >= 0 ? 'GAME_UPDATED' : 'GAME_CREATED',
      targetId: gameId,
      details: `U ruajt loja "${game.title}" me ${game.questionCount} pyetje.`,
      severity: 'info',
    });
    await store.commitAsync();

    res.status(201).json({
      game,
      questions: db.gameQuestions.filter((q) => q.gameId === gameId),
    });
  });

  const handleDeleteGameById = async (req: AuthenticatedRequest, res: Response) => {
    const { gameId } = req.params;
    const db = store.getState();
    const qs = db.gameQuestions.filter((q) => q.gameId === gameId);
    store.markDeleted([gameId, ...qs.map((q) => q.questionId)]);
    db.games = db.games.filter((g) => g.gameId !== gameId);
    db.gameQuestions = db.gameQuestions.filter((q) => q.gameId !== gameId);
    db.content.forEach((c) => {
      c.relatedGameIds = c.relatedGameIds.filter((id) => id !== gameId);
    });
    await store.commitAsync();
    res.json({ ok: true });
  };
  app.delete('/api/admin/games/:gameId', requireAdmin, handleDeleteGameById);
  app.post('/api/admin/games/:gameId/delete', requireAdmin, handleDeleteGameById);

  // Admin: User Account Creation & Access Policy Management
  app.post('/api/admin/users', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    const displayName = String(body.displayName || '').trim();
    if (!displayName) {
      res.status(400).json({ error: 'Emri i përdoruesit është i detyrueshëm.' });
      return;
    }

    await store.syncFromCloud();
    const db = store.getState();
    const preset = body.preset || 'full';

    const rawCustom = body.customCode ? String(body.customCode).replace(/\D/g, '') : '';
    if (body.customCode && rawCustom.length > 0 && rawCustom.length !== 9) {
      res.status(400).json({ error: 'Kodi personal duhet të ketë saktësisht 9 shifra.' });
      return;
    }
    const customDigits = rawCustom.length === 9 ? rawCustom : '';
    if (customDigits.length === 9) {
      const formattedCustom = `${customDigits.slice(0, 3)}-${customDigits.slice(3, 6)}-${customDigits.slice(6, 9)}`;
      const duplicate = db.users.some(
        (u) => (u.fullCode || '').replace(/\D/g, '') === customDigits || formattedCustom === '111-222-333'
      );
      if (duplicate) {
        res.status(400).json({ error: 'Ky kod 9-shifror është tashmë në përdorim nga një përdorues tjetër.' });
        return;
      }
    }

    const existingHashes = new Set(db.users.map((u) => u.codeHash));
    const generated = generateSecureAccessCode(
      existingHashes,
      PEPPER,
      preset,
      customDigits.length === 9 ? customDigits : undefined
    );
    const nowIso = new Date().toISOString();

    const basePolicy = createAccessPolicyPreset(preset);
    const mergedPolicy = {
      ...basePolicy,
      ...(body.accessPolicy || {}),
    };

    const newUser: UserAccount = {
      uid: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      codeHash: generated.hash,
      codeSalt: generated.salt,
      maskedCode: generated.maskedCode,
      fullCode: generated.formattedCode,
      role: 'user',
      status: body.status || 'active',
      displayName,
      avatar: String(body.avatar || 'eagle'),
      createdAt: nowIso,
      firstLoginAt: null,
      accessActivatedAt: null,
      lastLoginAt: null,
      accessPolicy: mergedPolicy,
      stats: {
        totalXp: 0,
        totalPoints: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        correctAnswers: 0,
        totalAnswers: 0,
        accuracyPercent: 0,
        currentStreak: 0,
        bestStreak: 0,
        rank: db.users.length,
        country: String(body.country || 'Shqipëri'),
        school: body.school ? String(body.school) : '',
        watchedSecondsToday: 0,
        gameSessionsToday: 0,
        lastActivityDate: nowIso.slice(0, 10),
      },
      achievements: [],
      likedShortIds: [],
      savedContentIds: [],
      recentActivity: [],
    };

    db.users.unshift(newUser);
    syncLeaderboardForUser(newUser);

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_CREATED',
      targetId: newUser.uid,
      details: `U krijua përdoruesi "${displayName}" (${newUser.fullCode}) me profilin e aksesit "${mergedPolicy.preset}".`,
      severity: 'info',
    });
    await store.commitAsync();

    res.status(201).json({
      user: sanitizeUser(newUser),
      oneTimeFormattedCode: generated.formattedCode,
      warningSq:
        'Ky kod 9-shifror është aktiv dhe mund të shihet e kopjohet në çdo kohë nga Super Admini.',
    });
  });

  // Update User Status & Granular Access Policy
  app.put('/api/admin/users/:uid', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid } = req.params;
    const body = req.body || {};
    await store.syncFromCloud();
    const db = store.getState();
    const user = db.users.find((u) => u.uid === uid && u.role !== 'super_admin');
    if (!user) {
      res.status(404).json({ error: 'Përdoruesi nuk u gjet.' });
      return;
    }

    if (body.displayName) user.displayName = String(body.displayName).trim();
    if (body.status) user.status = body.status;
    if (body.accessPolicy) {
      user.accessPolicy = {
        ...user.accessPolicy,
        ...body.accessPolicy,
      };
    }

    if (user.status === 'suspended' || user.status === 'revoked') {
      db.activeSessions.forEach((s) => {
        if (s.userId === user.uid) s.revoked = true;
      });
    }

    syncLeaderboardForUser(user);
    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_POLICY_UPDATED',
      targetId: user.uid,
      details: `U përditësua statusi (${user.status}) dhe kufizimet e aksesit për "${user.displayName}".`,
      severity: 'info',
    });
    await store.commitAsync();

    res.json({ user: sanitizeUser(user) });
  });

  // Regenerate Access Code for User
  app.post('/api/admin/users/:uid/regenerate-code', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid } = req.params;
    await store.syncFromCloud();
    const db = store.getState();
    const user = db.users.find((u) => u.uid === uid && u.role !== 'super_admin');
    if (!user) {
      res.status(404).json({ error: 'Përdoruesi nuk u gjet.' });
      return;
    }

    const existingHashes = new Set(db.users.map((u) => u.codeHash));
    const generated = generateSecureAccessCode(
      existingHashes,
      PEPPER,
      user.accessPolicy?.preset || 'full'
    );
    user.codeHash = generated.hash;
    user.codeSalt = generated.salt;
    user.maskedCode = generated.maskedCode;
    user.fullCode = generated.formattedCode;
    user.status = 'active';
    // IMPORTANT: Keep currently logged-in devices active!
    // Regenerating the code only prevents a kicked/new device from logging in with the old code.

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_CODE_REGENERATED',
      targetId: user.uid,
      details: `U rigjenerua kodi i aksesit për "${user.displayName}" (${user.fullCode}) pa shkëputur pajisjet aktuale.`,
      severity: 'warning',
    });
    await store.commitAsync();

    res.json({
      user: sanitizeUser(user),
      oneTimeFormattedCode: generated.formattedCode,
    });
  });

  // Revoke All Active Sessions for a User ("Log Out Every Device")
  app.post('/api/admin/users/:uid/revoke-sessions', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid } = req.params;
    const db = store.getState();
    let count = 0;
    const revokedIds: string[] = [];
    db.activeSessions.forEach((s) => {
      if (s.userId === uid && !s.revoked) {
        s.revoked = true;
        revokedIds.push(s.sessionId);
        count += 1;
      }
    });
    if (revokedIds.length > 0) store.markDeleted(revokedIds);
    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_SESSIONS_REVOKED',
      targetId: uid,
      details: `U nxorën jashtë (Log Out) të gjitha pajisjet aktive (${count} sesione).`,
      severity: 'warning',
    });
    await store.commitAsync();
    res.json({ ok: true, revokedCount: count });
  });

  // View All Sessions & Devices for a User (including what they watched/played & time of day)
  app.get('/api/admin/users/:uid/sessions', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid } = req.params;
    await store.syncFromCloud();
    const db = store.getState();
    const user = db.users.find((u) => u.uid === uid);
    if (!user) {
      res.status(404).json({ error: 'Përdoruesi nuk u gjet.' });
      return;
    }

    const userSessions = db.activeSessions
      .filter((s) => s.userId === uid)
      .sort((a, b) => new Date(b.lastSeenAt || b.createdAt).getTime() - new Date(a.lastSeenAt || a.createdAt).getTime());

    // Build fallback activity list from user.recentActivity and playbackProgress if a session predates per-session activityLog
    const userProgress = db.playbackProgress.filter((p) => p.userId === uid);
    const fallbackActivities: DeviceActivityItem[] = [];
    for (const prog of userProgress) {
      const contentItem = db.content.find((c) => c.contentId === prog.contentId);
      if (contentItem) {
        const ts = prog.updatedAt || new Date().toISOString();
        const posSec = prog.currentTimeSeconds || 0;
        const detStr = `Shikoi ${Math.round(prog.completionPercent || 0)}% (${Math.floor(posSec / 60)}m ${Math.floor(posSec % 60)}s)`;
        fallbackActivities.push({
          id: `act_prog_${prog.progressId}`,
          activityId: `act_prog_${prog.progressId}`,
          type: contentItem.videoFormat === 'short' ? 'short_watch' : 'video_watch',
          title: contentItem.title,
          targetId: contentItem.contentId,
          detail: detStr,
          details: detStr,
          timestamp: ts,
          timeOfDay: formatTimeOfDaySq(ts),
          watchedSeconds: prog.uniqueWatchedSeconds || 0,
          completionPercent: Math.round(prog.completionPercent || 0),
        });
      }
    }
    for (const act of user.recentActivity || []) {
      const ts = act.timestamp || new Date().toISOString();
      const actId = act.id || `act_hist_${Math.random().toString(36).slice(2, 7)}`;
      const detStr = act.detail || 'Aktivitet në platformë';
      fallbackActivities.push({
        id: actId,
        activityId: actId,
        type: act.type === 'game' ? 'game_play' : 'video_watch',
        title: act.title,
        detail: detStr,
        details: detStr,
        timestamp: ts,
        timeOfDay: formatTimeOfDaySq(ts),
      });
    }

    const formattedSessions: UserDeviceSession[] = userSessions.map((s, idx) => {
      const devId = s.deviceId || `dev_${s.sessionId.slice(0, 12)}`;
      const devLabel = s.deviceLabel || parseDeviceLabel(s.userAgent || '');
      const banned = isDeviceBannedForUser(devId, uid);
      const sessionActivities: DeviceActivityItem[] =
        Array.isArray(s.activityLog) && s.activityLog.length > 0
          ? s.activityLog
          : idx === 0
          ? fallbackActivities.slice(0, 15)
          : [
              {
                id: `act_login_${s.sessionId.slice(0, 8)}`,
                activityId: `act_login_${s.sessionId.slice(0, 8)}`,
                type: 'login',
                title: 'Hyrje në llogari',
                detail: `${devLabel} • IP: ${s.ipAddress || '127.0.0.1'}`,
                details: `${devLabel} • IP: ${s.ipAddress || '127.0.0.1'}`,
                timestamp: s.createdAt,
                timeOfDay: formatTimeOfDaySq(s.createdAt),
              },
            ];

      return {
        sessionId: s.sessionId,
        userId: s.userId,
        deviceId: devId,
        deviceLabel: devLabel,
        userAgent: s.userAgent || 'Shfletues Web',
        ipAddress: s.ipAddress || '127.0.0.1',
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt || s.createdAt,
        expiresAt: s.expiresAt,
        revoked: Boolean(s.revoked),
        isBanned: banned,
        activityLog: sessionActivities,
      };
    });

    const userBannedDevices = (db.bannedDevices || []).filter((b) => b.userId === uid);

    res.json({
      user: sanitizeUser(user),
      sessions: formattedSessions,
      bannedDevices: userBannedDevices,
    });
  });

  // Stop / Kick a Single Device Session
  app.post('/api/admin/users/:uid/sessions/:sessionId/stop', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid, sessionId } = req.params;
    const db = store.getState();
    const targetSession = db.activeSessions.find((s) => s.sessionId === sessionId && s.userId === uid);
    if (!targetSession) {
      res.status(404).json({ error: 'Sesioni nuk u gjet.' });
      return;
    }

    targetSession.revoked = true;
    store.markDeleted(targetSession.sessionId);
    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_DEVICE_SESSION_STOPPED',
      targetId: uid,
      details: `U ndalua sesioni në pajisjen "${targetSession.deviceLabel || parseDeviceLabel(targetSession.userAgent)}" (${targetSession.ipAddress}).`,
      severity: 'warning',
    });
    await store.commitAsync();

    res.json({ ok: true, sessionId });
  });

  // Ban / Forbid a Device from Ever Logging Into the Account Again
  app.post('/api/admin/users/:uid/devices/ban', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid } = req.params;
    const { sessionId, deviceId, reason } = req.body || {};
    const db = store.getState();
    if (!Array.isArray(db.bannedDevices)) {
      db.bannedDevices = [];
    }

    const session = db.activeSessions.find(
      (s) => s.userId === uid && ((sessionId && s.sessionId === sessionId) || (deviceId && s.deviceId === deviceId))
    );

    const targetDeviceId = String(deviceId || session?.deviceId || `dev_${String(sessionId || Date.now()).slice(0, 12)}`);
    const targetLabel = session?.deviceLabel || parseDeviceLabel(session?.userAgent || '') || 'Pajisje e Panjohur';
    const targetUa = session?.userAgent || '';
    const targetIp = session?.ipAddress || '';

    // Revoke all sessions matching this device for this user
    db.activeSessions.forEach((s) => {
      if (
        s.userId === uid &&
        (s.deviceId === targetDeviceId ||
          (sessionId && s.sessionId === sessionId) ||
          (targetIp && targetUa && s.ipAddress === targetIp && s.userAgent === targetUa))
      ) {
        s.revoked = true;
      }
    });

    const existingBan = db.bannedDevices.find((b) => b.userId === uid && b.deviceId === targetDeviceId);
    if (!existingBan) {
      const banRecord: BannedDeviceRecord = {
        banId: `ban_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: uid,
        deviceId: targetDeviceId,
        deviceLabel: targetLabel,
        ipAddress: targetIp,
        userAgent: targetUa,
        bannedAt: new Date().toISOString(),
        bannedByUid: req.user!.uid,
        reason: String(reason || 'Pajisje e paautorizuar e raportuar nga përdoruesi.'),
      };
      db.bannedDevices.push(banRecord);
    }

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_DEVICE_BANNED',
      targetId: uid,
      details: `U bllokua përgjithmonë pajisja "${targetLabel}" (${targetDeviceId}) për përdoruesin ${uid}.`,
      severity: 'critical',
    });
    await store.commitAsync();

    res.json({ ok: true, bannedDevices: db.bannedDevices.filter((b) => b.userId === uid) });
  });

  // Unban / Allow a Previously Banned Device
  app.post('/api/admin/users/:uid/devices/unban', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { uid } = req.params;
    const { deviceId, banId } = req.body || {};
    const db = store.getState();
    if (!Array.isArray(db.bannedDevices)) {
      db.bannedDevices = [];
    }

    const toRemove = db.bannedDevices.filter(
      (b) => b.userId === uid && ((banId && b.banId === banId) || (deviceId && b.deviceId === deviceId))
    );
    if (toRemove.length > 0) {
      store.markDeleted(toRemove.map((b) => b.banId || b.deviceId));
    }
    db.bannedDevices = db.bannedDevices.filter(
      (b) => !(b.userId === uid && ((banId && b.banId === banId) || (deviceId && b.deviceId === deviceId)))
    );

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'USER_DEVICE_UNBANNED',
      targetId: uid,
      details: `U hoq bllokimi për pajisjen ${deviceId || banId} në llogarinë ${uid}.`,
      severity: 'info',
    });
    await store.commitAsync();

    res.json({ ok: true, bannedDevices: db.bannedDevices.filter((b) => b.userId === uid) });
  });

  // ============================================================================
  // LIVE SUPPORT CHAT — "MITO" AI ASSISTANT (Powered by Real Gemini API)
  // ============================================================================
  const buildUserSafeContextForSupportAi = (
    db: ReturnType<typeof store.getState>,
    user: UserAccount,
    currentSessionId?: string
  ): string => {
    const userSessions = (db.activeSessions || []).filter(
      (s) => s.userId === user.uid && !s.revoked
    );

    const sessionsSummary =
      userSessions.length === 0
        ? 'Vetëm pajisja aktuale e lidhur.'
        : userSessions
            .map((s, idx) => {
              const isCurrent = currentSessionId && s.sessionId === currentSessionId;
              const recentActs = (s.activityLog || [])
                .slice(0, 4)
                .map((a) => `${a.title} (ora ${a.timeOfDay})`)
                .join('; ');
              return `  ${idx + 1}. Pajisja: "${s.deviceLabel || 'Shfletues Web'}" [DeviceID: ${s.deviceId || 'pa-id'}, SessionID: ${s.sessionId}]${isCurrent ? ' (PAJISJA AKTUALE E PËRDORUESIT NË CHAT)' : ''} | IP: ${s.ipAddress} | Aktiv së fundmi: ${s.lastSeenAt} | Aktiviteti: ${recentActs || 'Hyrje në platformë'}`;
            })
            .join('\n');

    const userBannedDevices = (db.bannedDevices || []).filter((b) => b.userId === user.uid);
    const bannedSummary =
      userBannedDevices.length === 0
        ? 'Asnjë pajisje e bllokuar në llogarinë e përdoruesit.'
        : userBannedDevices
            .map((b) => `"${b.deviceLabel}" (DeviceID: ${b.deviceId}, Arsyeja: ${b.reason})`)
            .join(', ');

    const userProgress = (db.playbackProgress || []).filter((p) => p.userId === user.uid);
    const publishedContent = (db.content || []).filter((c) => c.publicationStatus === 'published');
    const publishedGames = (db.games || []).filter((g) => g.publicationStatus === 'published');
    const topLeaderboard = [...(db.leaderboardEntries || [])]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5);

    const contentSummary = publishedContent
      .map((c) => {
        const prog = userProgress.find((p) => p.contentId === c.contentId);
        const mins = Math.floor((c.durationSeconds || 631) / 60);
        const secs = (c.durationSeconds || 631) % 60;
        return `- Titulli: "${c.title}" | Kohëzgjatja: ${mins}m ${secs}s | Rezolucioni: ${c.width || 1920}x${c.height || 824} | Kategoria: Legjendat | Progresi i përdoruesit: ${prog ? `${prog.completionPercent}% (${Math.round(prog.currentTimeSeconds)}s)` : '0%'} | Përshkrimi: ${c.synopsis}`;
      })
      .join('\n');

    const gamesSummary = publishedGames
      .map(
        (g) =>
          `- Kuizi: "${g.title}" (Lloji: ${g.gameType}, Vështirësia: ${g.difficulty}, Shpërblimi për përfundim me sukses: ${g.xpReward} XP)`
      )
      .join('\n');

    const leaderboardSummary =
      topLeaderboard.length === 0
        ? 'Ende nuk ka renditje.'
        : topLeaderboard
            .map(
              (e, i) =>
                `#${i + 1} ${e.displayName} (${e.totalPoints} pikë, ${e.totalXp} XP)`
            )
            .join(' | ');

    return `=== IDENTITETI YT: ASISTENTI ZYRTAR AI "MITO" ===
Ti quhesh "MITO". Je Asistenti Zyrtar Inteligjent i Mbështetjes në platformën shqiptare "MITO — Legjenda · Histori · Lojëra".

=== TË DHËNAT E LLOGARISË SË PËRDORUESIT AKTUAL ===
- Emri: ${user.displayName} (UID: ${user.uid}, Statusi: ${user.status})
- Kodi i hyrjes i llogarisë: ${user.fullCode || user.maskedCode}
- Statistikat e fituara: ${user.stats?.totalXp || 0} XP, ${user.stats?.totalPoints || 0} Pikë, Vendi #${user.stats?.rank || 1}, Kuice të luajtura: ${user.stats?.gamesPlayed || 0}

=== PAJISJET DHE SESIONET AKTIVE TË KËTIJ PËRDORUESI ===
${sessionsSummary}
- Pajisje të bllokuara në këtë llogari: ${bannedSummary}

=== FILMAT DHE FUNKSIONIMI I PLATFORMËS ===
${contentSummary || '- BESA Short Film Higgsfield Global Film Festival Nominee OLL KORRECT (824p) (10m 31s)'}
- Player-i: Filmi "BESA Short Film" ndodhet te seksioni "Legjendat" dhe "Vazhdo Shikimin". Butoni Fullscreen ndodhet poshtë-djathtas në player.

=== KUIZET DHE RENDITJA ===
${gamesSummary}
- Renditja aktuale (Top 5): ${leaderboardSummary}`;
  };

  interface MitoExecutedActionResult {
    executed: boolean;
    summarySq: string;
  }

  // Safe account support actions ONLY for the logged-in user's own account.
  // Never modifies XP/points, never deletes movies/platform data, never touches other users' accounts.
  const executeMitoSupportAction = (
    db: ReturnType<typeof store.getState>,
    caller: UserAccount,
    actionType: string,
    params: {
      deviceKeyword?: string;
      newValue?: string;
    },
    currentSessionId?: string
  ): MitoExecutedActionResult => {
    const cleanAction = String(actionType || 'none').trim().toLowerCase();
    if (!cleanAction || cleanAction === 'none') {
      return { executed: false, summarySq: '' };
    }

    const targetUser = db.users.find((u) => u.uid === caller.uid) || caller;

    // 1. Kick / Stop specific device(s) on the user's own account
    if (cleanAction === 'kick_specific_device' || cleanAction === 'stop_device') {
      const kw = String(params.deviceKeyword || '').trim().toLowerCase();
      const activeForTarget = (db.activeSessions || []).filter(
        (s) => s.userId === targetUser.uid && !s.revoked
      );
      const matched = activeForTarget.filter((s) => {
        if (!kw) return !currentSessionId || s.sessionId !== currentSessionId;
        const label = `${s.deviceLabel || ''} ${s.userAgent || ''} ${s.deviceId || ''} ${s.ipAddress || ''}`.toLowerCase();
        return label.includes(kw);
      });

      const toRevoke = kw
        ? matched
        : activeForTarget.filter((s) => !currentSessionId || s.sessionId !== currentSessionId);

      const kickedLabels: string[] = [];
      for (const s of toRevoke) {
        s.revoked = true;
        store.markDeleted(s.sessionId);
        kickedLabels.push(`${s.deviceLabel || 'Pajisje Web'} (IP: ${s.ipAddress})`);
      }

      store.addAuditLog({
        actorUid: caller.uid,
        actorRole: caller.role,
        action: 'MITO_AI_KICKED_DEVICE',
        targetId: targetUser.uid,
        details: `Asistenti MITO nxori jashtë ${kickedLabels.length} pajisje (${kickedLabels.join(', ')}) nga llogaria e ${targetUser.displayName}.`,
        severity: 'warning',
      });

      if (kickedLabels.length > 0) {
        return {
          executed: true,
          summarySq: `✅ U nxorën jashtë (Log Out) ${kickedLabels.length} pajisje nga llogaria juaj: ${kickedLabels.join('; ')}.`,
        };
      }
      return {
        executed: true,
        summarySq: `ℹ️ Nuk u gjet asnjë pajisje tjetër aktive${kw ? ` që përputhet me "${kw}"` : ''} në llogarinë tuaj.`,
      };
    }

    // 2. Ban specific device on the user's own account
    if (cleanAction === 'ban_device') {
      const kw = String(params.deviceKeyword || '').trim().toLowerCase();
      if (!Array.isArray(db.bannedDevices)) db.bannedDevices = [];
      const activeForTarget = (db.activeSessions || []).filter(
        (s) => s.userId === targetUser.uid && !s.revoked
      );
      const matched = activeForTarget.filter((s) => {
        if (currentSessionId && s.sessionId === currentSessionId) return false;
        if (!kw) return true;
        const label = `${s.deviceLabel || ''} ${s.userAgent || ''} ${s.deviceId || ''}`.toLowerCase();
        return label.includes(kw);
      });

      const bannedLabels: string[] = [];
      for (const s of matched) {
        s.revoked = true;
        store.markDeleted(s.sessionId);
        const devId = s.deviceId || `dev_${s.sessionId}`;
        if (!db.bannedDevices.some((b) => b.userId === targetUser.uid && b.deviceId === devId)) {
          db.bannedDevices.push({
            banId: `ban_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId: targetUser.uid,
            deviceId: devId,
            deviceLabel: s.deviceLabel || 'Pajisje e bllokuar',
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            reason: `Bllokuar nga Asistenti MITO me kërkesë të përdoruesit.`,
            bannedAt: new Date().toISOString(),
            bannedByUid: caller.uid,
          });
        }
        bannedLabels.push(`${s.deviceLabel || 'Pajisje'} (${s.ipAddress})`);
      }

      if (bannedLabels.length > 0) {
        return {
          executed: true,
          summarySq: `🚫 Pajisja ${bannedLabels.join(', ')} u nxor jashtë dhe u bllokua nga llogaria juaj.`,
        };
      }
      return {
        executed: true,
        summarySq: `ℹ️ Nuk u gjet asnjë pajisje tjetër aktive${kw ? ` që përputhet me "${kw}"` : ''} për t'u bllokuar.`,
      };
    }

    // 3. Unban device on the user's own account
    if (cleanAction === 'unban_device') {
      const kw = String(params.deviceKeyword || '').trim().toLowerCase();
      const beforeCount = (db.bannedDevices || []).length;
      const toRemove = (db.bannedDevices || []).filter(
        (b) =>
          b.userId === targetUser.uid &&
          (!kw || b.deviceLabel.toLowerCase().includes(kw) || b.deviceId.toLowerCase().includes(kw))
      );
      if (toRemove.length > 0) {
        store.markDeleted(toRemove.map((b) => b.banId || b.deviceId));
      }
      db.bannedDevices = (db.bannedDevices || []).filter((b) => !toRemove.includes(b));
      const removedCount = beforeCount - db.bannedDevices.length;
      return {
        executed: true,
        summarySq:
          removedCount > 0
            ? `🔓 U hoq bllokimi për ${removedCount} pajisje në llogarinë tuaj.`
            : `ℹ️ Nuk keni asnjë pajisje të bllokuar në llogarinë tuaj.`,
      };
    }

    // 4. Logout all other devices on the user's own account
    if (cleanAction === 'logout_other_devices') {
      let stoppedCount = 0;
      const stoppedNames: string[] = [];
      for (const s of db.activeSessions || []) {
        if (
          s.userId === targetUser.uid &&
          !s.revoked &&
          (!currentSessionId || s.sessionId !== currentSessionId)
        ) {
          s.revoked = true;
          store.markDeleted(s.sessionId);
          stoppedCount++;
          stoppedNames.push(s.deviceLabel || 'Shfletues Web');
        }
      }
      store.addAuditLog({
        actorUid: caller.uid,
        actorRole: caller.role,
        action: 'MITO_AI_LOGOUT_DEVICES',
        targetId: targetUser.uid,
        details: `MITO mbylli ${stoppedCount} sesione të tjera në llogarinë "${targetUser.displayName}".`,
        severity: 'warning',
      });
      return {
        executed: true,
        summarySq:
          stoppedCount > 0
            ? `✅ U mbyllën (Log Out) ${stoppedCount} pajisje të tjera nga llogaria juaj (${stoppedNames.join(', ')}).`
            : `ℹ️ Vetëm pajisja juaj aktuale është e lidhur — nuk ka pajisje të tjera aktive.`,
      };
    }

    // 5. Regenerate the user's own access code (keeps current session logged in)
    if (cleanAction === 'regenerate_code') {
      const existingHashes = new Set(db.users.map((u) => u.codeHash));
      const generated = generateSecureAccessCode(
        existingHashes,
        PEPPER,
        targetUser.accessPolicy?.preset || 'full'
      );
      targetUser.codeSalt = generated.salt;
      targetUser.codeHash = generated.hash;
      targetUser.maskedCode = generated.maskedCode;
      targetUser.fullCode = generated.formattedCode;
      targetUser.status = 'active';
      store.addAuditLog({
        actorUid: caller.uid,
        actorRole: caller.role,
        action: 'MITO_AI_CODE_REGENERATED',
        targetId: targetUser.uid,
        details: `MITO rigjeneroi kodin e hyrjes për "${targetUser.displayName}" në ${generated.formattedCode}.`,
        severity: 'warning',
      });
      return {
        executed: true,
        summarySq: `🔑 Kodi juaj i ri i hyrjes u gjenerua: **${generated.formattedCode}**. Pajisja juaj aktuale mbetet e lidhur, ndërsa askush nuk mund të hyjë më me kodin e vjetër.`,
      };
    }

    // 6. Update the user's own display name
    if (cleanAction === 'update_display_name') {
      const val = String(params.newValue || '').trim();
      if (val && val.length >= 2 && val.length <= 40) {
        targetUser.displayName = val;
        syncLeaderboardForUser(targetUser);
        return {
          executed: true,
          summarySq: `✅ Emri i profilit tuaj u përditësua në "${val}".`,
        };
      }
    }

    return { executed: false, summarySq: '' };
  };

  const generateSupportAiResponse = async (
    db: ReturnType<typeof store.getState>,
    user: UserAccount,
    userMessage: string,
    history: SupportChatMessage[],
    currentSessionId?: string
  ): Promise<{ replyText: string; suggestHumanEscalation: boolean }> => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const platformContext = buildUserSafeContextForSupportAi(db, user, currentSessionId);

    const recentTranscript = history
      .slice(-12)
      .map((m) => `${m.senderRole.toUpperCase()} (${m.senderName}): ${m.text}`)
      .join('\n');

    const systemInstruction = `Ti je "MITO", Asistenti Zyrtar AI i Mbështetjes në platformën shqiptare "MITO — Legjenda · Histori · Lojëra".

RREGULLAT E TUA TË DETYRUESHME:
1. Përgjigju gjithmonë natyrshëm, me mirësjellje dhe qartë në gjuhën shqipe si një inteligjencë artificiale e vërtetë.
2. SIGURIA DHE ANTI-MASHTRIMI (SHUMË E RËNDËSISHME):
   - KURRË mos jep përgjigjet e sakta të pyetjeve të kuizit BESA dhe mos e ndihmo përdoruesin të kopjojë në kuiz. Inkurajoje të shikojë filmin BESA dhe të fitojë pikët me meritë.
   - KURRË mos shto dhe mos premto shtim falas të pikëve apo XP-ve (pikët dhe XP fitohen vetëm duke parë filmin dhe duke zgjidhur kuizin).
   - KURRË mos fshi filma, mos ndrysho përmbajtjen e platformës dhe mos ndërhyj në llogaritë e përdoruesve të tjerë apo të administratorit.
3. VEPRIMET E LEJUARA NË LLOGARINË E PËRDORUESIT AKTUAL:
   Ti mund të kryesh vetëm këto veprime të sigurta të mbështetjes për llogarinë e vetë përdoruesit që po të shkruan, duke vendosur fushën "actionType" në JSON:
   - "kick_specific_device" (me "deviceKeyword" p.sh. "mac", "iphone", "chrome", "safari", "windows") kur përdoruesi të kërkon të heqësh/nxjerrësh jashtë një pajisje nga llogaria e tij.
   - "ban_device" (me "deviceKeyword") kur përdoruesi të kërkon të bllokojë një pajisje të panjohur në llogarinë e tij.
   - "unban_device" (me "deviceKeyword") kur përdoruesi të kërkon të zhbllokojë një pajisje të tij.
   - "logout_other_devices" kur përdoruesi të kërkon të mbyllë të gjitha pajisjet e tjera të lidhura në llogarinë e tij.
   - "regenerate_code" kur përdoruesi të kërkon të rigjenerojë kodin e hyrjes së llogarisë së tij.
   - "update_display_name" (me "newValue" emrin e ri) kur përdoruesi të kërkon të ndryshojë emrin e profilit të tij.
   - "none" për çdo bisedë apo pyetje tjetër.
4. KALIMI TE AGJENTI NJERËZOR (SUPER ADMIN):
   - Nëse përdoruesi kërkon të flasë me një njeri real, agjent njerëzor, suport njerëzor ose Super Admin (ose ka një problem që kërkon ndërhyrjen e një njeriu), vendos "escalateToHuman": true. Përndryshe vendos "escalateToHuman": false.

${platformContext}`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        replyText: {
          type: Type.STRING,
          description: 'Përgjigjja jote e natyrshme në gjuhën shqipe si MITO AI.',
        },
        actionType: {
          type: Type.STRING,
          description:
            'Një nga: "none", "kick_specific_device", "ban_device", "unban_device", "logout_other_devices", "regenerate_code", "update_display_name".',
        },
        deviceKeyword: {
          type: Type.STRING,
          description: 'Fjala kyçe e pajisjes (p.sh. "mac", "iphone", "chrome") nëse po hiqet ose bllokohet një pajisje.',
        },
        newValue: {
          type: Type.STRING,
          description: 'Emri i ri i profilit nëse actionType është "update_display_name".',
        },
        escalateToHuman: {
          type: Type.BOOLEAN,
          description: 'Vendos true nëse përdoruesi kërkon të flasë me një agjent njerëzor / Super Admin.',
        },
      },
      required: ['replyText', 'actionType', 'escalateToHuman'],
    };

    const callModel = async (modelName: string) =>
      ai.models.generateContent({
        model: modelName,
        contents: `Historiku i bisedës:\n${recentTranscript}\n\nMESAZHI I FUNDIT I PËRDORUESIT: ${userMessage}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

    let response;
    try {
      response = await callModel('gemini-4-argon');
    } catch {
      response = await callModel('gemini-3.8-flash');
    }

    const rawJson = (response.text || '').trim();
    const parsed = JSON.parse(rawJson) as {
      replyText?: string;
      actionType?: string;
      deviceKeyword?: string;
      newValue?: string;
      escalateToHuman?: boolean;
    };

    let finalReply = (parsed.replyText || '').trim();

    if (parsed.actionType && parsed.actionType !== 'none') {
      const actionRes = executeMitoSupportAction(
        db,
        user,
        parsed.actionType,
        {
          deviceKeyword: parsed.deviceKeyword,
          newValue: parsed.newValue,
        },
        currentSessionId
      );
      if (actionRes.executed && actionRes.summarySq) {
        finalReply = finalReply ? `${finalReply}\n\n${actionRes.summarySq}` : actionRes.summarySq;
      }
    }

    return {
      replyText: finalReply,
      suggestHumanEscalation: Boolean(parsed.escalateToHuman),
    };
  };

  function buildWelcomeTicketPreviewForUser(user: UserAccount): SupportTicket {
    const nowIso = new Date().toISOString();
    return {
      ticketId: `preview_${user.uid}`,
      userId: user.uid,
      userDisplayName: user.displayName,
      userCode: user.maskedCode,
      userMaskedCode: user.maskedCode,
      status: 'ai_active',
      createdAt: nowIso,
      updatedAt: nowIso,
      lastMessagePreview: 'MITO AI është gati t’ju ndihmojë.',
      unreadByAdmin: 0,
      unreadByUser: 0,
      messages: [
        {
          messageId: `msg_welcome_${user.uid}`,
          ticketId: `preview_${user.uid}`,
          senderRole: 'ai',
          senderName: 'MITO',
          text: `Përshëndetje ${user.displayName}! Unë jam MITO, asistenti juaj inteligjent i mbështetjes. Mund t'ju ndihmoj me llogarinë tuaj, pajisjet e lidhura, kodin e hyrjes, apo çdo pyetje rreth platformës dhe filmit BESA. Gjithashtu, në çdo moment mund të kërkoni të flisni me një Agjent Njerëzor. Si mund t'ju ndihmoj sot?`,
          timestamp: nowIso,
          createdAt: nowIso,
        },
      ],
    };
  }

  function getCleanActiveSupportTickets(db: ReturnType<typeof store.getState>): SupportTicket[] {
    if (!Array.isArray(db.supportTickets)) {
      db.supportTickets = [];
      return [];
    }
    const invalidIds: string[] = [];
    const validTickets = db.supportTickets.filter((t) => {
      if (!t || !t.ticketId) return false;
      const hasUserMessage =
        Array.isArray(t.messages) && t.messages.some((m) => m.senderRole === 'user');
      const isHumanEscalated = t.status === 'human_requested' || t.status === 'human_active';
      const isFakeOrTest =
        t.status === 'resolved' ||
        t.ticketId === 'tkt_1794063091540_3c99e6' ||
        t.ticketId === 'tkt_1794159269293_d2d470' ||
        t.ticketId.startsWith('preview_') ||
        t.ticketId.includes('fake') ||
        t.ticketId.includes('demo') ||
        t.userId === 'usr_demo_student_mito' ||
        (!hasUserMessage && !isHumanEscalated);

      if (isFakeOrTest) {
        invalidIds.push(t.ticketId);
        return false;
      }
      return true;
    });

    if (invalidIds.length > 0) {
      store.markDeleted(invalidIds);
      db.supportTickets = validTickets;
      store.commit();
    }

    for (const t of validTickets) {
      for (const m of t.messages || []) {
        if (m.senderRole === 'ai') {
          m.senderName = 'MITO';
        }
      }
    }

    return validTickets.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  const getOrCreateSupportTicketForUser = (
    db: ReturnType<typeof store.getState>,
    user: UserAccount
  ): SupportTicket => {
    getCleanActiveSupportTickets(db);
    let ticket = db.supportTickets.find((t) => t.userId === user.uid && t.status !== 'resolved');
    const nowIso = new Date().toISOString();
    if (!ticket) {
      const ticketId = `tkt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const newTicket: SupportTicket = {
        ticketId,
        userId: user.uid,
        userDisplayName: user.displayName,
        userCode: user.maskedCode,
        userMaskedCode: user.maskedCode,
        status: 'ai_active',
        createdAt: nowIso,
        updatedAt: nowIso,
        lastMessagePreview: 'Biseda me MITO u hap.',
        unreadByAdmin: 0,
        unreadByUser: 0,
        messages: [
          {
            messageId: `msg_welcome_${Date.now()}`,
            ticketId,
            senderRole: 'ai',
            senderName: 'MITO',
            text: `Përshëndetje ${user.displayName}! Unë jam MITO, asistenti juaj inteligjent i mbështetjes. Mund t'ju ndihmoj me llogarinë tuaj, pajisjet e lidhura, kodin e hyrjes, apo çdo pyetje rreth platformës dhe filmit BESA. Gjithashtu, në çdo moment mund të kërkoni të flisni me një Agjent Njerëzor. Si mund t'ju ndihmoj sot?`,
            timestamp: nowIso,
            createdAt: nowIso,
          },
        ],
      };
      db.supportTickets.unshift(newTicket);
      ticket = newTicket;
    }
    return ticket;
  };

  app.get('/api/support/my-ticket', requireAuth, async (req: AuthenticatedRequest, res) => {
    await store.syncFromCloud();
    const db = store.getState();
    const activeTickets = getCleanActiveSupportTickets(db);
    const existing = activeTickets.find((t) => t.userId === req.user!.uid);
    if (existing) {
      if ((existing.unreadByUser || 0) > 0) {
        existing.unreadByUser = 0;
        await store.commitAsync();
      }
      res.json({ ticket: existing });
      return;
    }
    res.json({ ticket: buildWelcomeTicketPreviewForUser(req.user!) });
  });

  app.post('/api/support/message', requireAuth, async (req: AuthenticatedRequest, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Mesazhi nuk mund të jetë bosh.' });
      return;
    }

    await store.syncFromCloud();
    const db = store.getState();
    const user = req.user!;
    const initialTicket = getOrCreateSupportTicketForUser(db, user);
    const targetTicketId = initialTicket.ticketId;
    const nowIso = new Date().toISOString();

    const userMsg: SupportChatMessage = {
      messageId: `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      ticketId: targetTicketId,
      senderRole: 'user',
      senderName: user.displayName,
      text,
      createdAt: nowIso,
    };

    // CRITICAL: When a human agent has been requested ('human_requested') or has joined the conversation ('human_active'),
    // DO NOT let the AI speak in the chat! Only let AI speak if status === 'ai_active' (i.e. before human escalation or if Super Admin explicitly clicked "Kalo te AI").
    if (initialTicket.status !== 'ai_active') {
      initialTicket.messages.push(userMsg);
      initialTicket.updatedAt = nowIso;
      initialTicket.lastMessagePreview = text.slice(0, 120);
      initialTicket.unreadByAdmin = (initialTicket.unreadByAdmin || 0) + 1;

      await store.commitAsync();
      broadcastSupportUpdate({
        event: 'user_message_for_human',
        ticketId: initialTicket.ticketId,
        userId: user.uid,
      });
      res.json({ ticket: initialTicket });
      return;
    }

    const historyForAi = [...(initialTicket.messages || []), userMsg];

    try {
      const aiResult = await generateSupportAiResponse(
        db,
        user,
        text,
        historyForAi,
        req.sessionId
      );

      const aiNowIso = new Date().toISOString();
      const aiMsg: SupportChatMessage = {
        messageId: `msg_ai_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        ticketId: targetTicketId,
        senderRole: 'ai',
        senderName: 'MITO',
        text: aiResult.replyText,
        timestamp: aiNowIso,
        createdAt: aiNowIso,
      };

      const liveDb = store.getState();
      let liveTicket = (liveDb.supportTickets || []).find((t) => t.ticketId === targetTicketId);
      if (!liveTicket) {
        liveTicket = getOrCreateSupportTicketForUser(liveDb, user);
      }

      if (!liveTicket.messages.some((m) => m.messageId === userMsg.messageId)) {
        liveTicket.messages.push(userMsg);
      }

      // Double-check that a human didn't take over while the AI call was in flight
      if (liveTicket.status === 'ai_active') {
        liveTicket.messages.push(aiMsg);
        liveTicket.updatedAt = aiNowIso;
        liveTicket.lastMessagePreview = aiResult.replyText.slice(0, 120);
        liveTicket.unreadByAdmin = (liveTicket.unreadByAdmin || 0) + 1;

        if (aiResult.suggestHumanEscalation) {
          liveTicket.status = 'human_requested';
          liveTicket.messages.push({
            messageId: `msg_sys_${Date.now()}`,
            ticketId: liveTicket.ticketId,
            senderRole: 'system',
            senderName: 'Sistemi MITO',
            text: 'Biseda u kalua te Agjenti Njerëzor (Super Admin). Asistenti AI u largua nga biseda.',
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        liveTicket.updatedAt = nowIso;
        liveTicket.lastMessagePreview = text.slice(0, 120);
        liveTicket.unreadByAdmin = (liveTicket.unreadByAdmin || 0) + 1;
      }

      await store.commitAsync();
      broadcastSupportUpdate({
        event: 'message_completed',
        ticketId: liveTicket.ticketId,
        userId: user.uid,
      });
      res.json({ ticket: liveTicket });
    } catch (err: any) {
      console.error('Gemini AI error in /api/support/message:', err);
      const liveDb = store.getState();
      let liveTicket = (liveDb.supportTickets || []).find((t) => t.ticketId === targetTicketId);
      if (!liveTicket) {
        liveTicket = getOrCreateSupportTicketForUser(liveDb, user);
      }
      if (!liveTicket.messages.some((m) => m.messageId === userMsg.messageId)) {
        liveTicket.messages.push(userMsg);
      }
      const errMsgStr = String(err?.message || '');
      const isBillingOrQuota =
        err?.status === 402 ||
        err?.status === 429 ||
        errMsgStr.includes('402') ||
        errMsgStr.includes('prepayment credits');

      liveTicket.messages.push({
        messageId: `msg_sys_${Date.now()}`,
        ticketId: liveTicket.ticketId,
        senderRole: 'system',
        senderName: 'Sistemi MITO',
        text: isBillingOrQuota
          ? 'API e Gemini ktheu kodin 402 (Kreditet e projektit në Google AI Studio janë shteruar). Ju lutemi vendosni një çelës aktiv GEMINI_API_KEY te Settings > Secrets ose shtypni "Kërko Agjent Njerëzor" për të folur direkt me Super Adminin.'
          : 'Lidhja me Gemini API dështoi përkohësisht. Ju lutemi provoni përsëri ose shtypni "Kërko Agjent Njerëzor" për të folur me Super Adminin.',
        createdAt: new Date().toISOString(),
      });
      liveTicket.updatedAt = nowIso;
      liveTicket.lastMessagePreview = text.slice(0, 120);
      liveTicket.unreadByAdmin = (liveTicket.unreadByAdmin || 0) + 1;
      await store.commitAsync();
      broadcastSupportUpdate({
        event: 'message_completed',
        ticketId: liveTicket.ticketId,
        userId: user.uid,
      });
      res.json({ ticket: liveTicket });
    }
  });

  app.post('/api/support/request-human', requireAuth, async (req: AuthenticatedRequest, res) => {
    const reason = String(req.body?.reason || '').trim();
    await store.syncFromCloud();
    const db = store.getState();
    const user = req.user!;
    const ticket = getOrCreateSupportTicketForUser(db, user);
    const nowIso = new Date().toISOString();

    ticket.status = 'human_requested';
    ticket.updatedAt = nowIso;
    ticket.unreadByAdmin = (ticket.unreadByAdmin || 0) + 1;

    if (reason) {
      ticket.messages.push({
        messageId: `msg_${Date.now()}_usr`,
        ticketId: ticket.ticketId,
        senderRole: 'user',
        senderName: user.displayName,
        text: reason,
        createdAt: nowIso,
      });
    }

    const sysMsg: SupportChatMessage = {
      messageId: `msg_sys_${Date.now()}`,
      ticketId: ticket.ticketId,
      senderRole: 'system',
      senderName: 'Sistemi MITO',
      text: 'Kërkesa për të folur me një Agjent Njerëzor u dërgua! Super Admini u njoftua dhe do të bashkohet në këtë bisedë.',
      createdAt: nowIso,
    };
    ticket.messages.push(sysMsg);
    ticket.lastMessagePreview = reason
      ? reason.slice(0, 120)
      : 'Kërkoi të flasë me një Agjent Njerëzor.';

    await store.commitAsync();
    broadcastSupportUpdate({
      event: 'human_requested',
      ticketId: ticket.ticketId,
      userId: user.uid,
    });
    res.json({ ticket });
  });

  // Super Admin: List All Active Support Tickets
  app.get('/api/admin/support/tickets', requireAdmin, async (_req: AuthenticatedRequest, res) => {
    await store.syncFromCloud();
    const db = store.getState();
    const tickets = getCleanActiveSupportTickets(db);
    res.json({ tickets });
  });

  // Super Admin: Reply as Human Support Agent
  app.post('/api/admin/support/tickets/:ticketId/reply', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { ticketId } = req.params;
    const text = String(req.body?.text || '').trim();
    if (!text) {
      res.status(400).json({ error: 'Përgjigjja nuk mund të jetë bosh.' });
      return;
    }

    await store.syncFromCloud();
    const db = store.getState();
    const ticket = (db.supportTickets || []).find((t) => t.ticketId === ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Biseda e supportit nuk u gjet.' });
      return;
    }

    const nowIso = new Date().toISOString();
    ticket.status = 'human_active';
    ticket.unreadByAdmin = 0;
    ticket.unreadByUser = (ticket.unreadByUser || 0) + 1;
    ticket.updatedAt = nowIso;
    ticket.lastMessagePreview = text.slice(0, 120);

    const agentMsg: SupportChatMessage = {
      messageId: `msg_agent_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      ticketId: ticket.ticketId,
      senderRole: 'agent',
      senderName: req.user?.displayName || 'Agjent Supporti (Super Admin)',
      text,
      createdAt: nowIso,
    };
    ticket.messages.push(agentMsg);

    await store.commitAsync();
    broadcastSupportUpdate({
      event: 'admin_reply',
      ticketId: ticket.ticketId,
      userId: ticket.userId,
    });
    res.json({ ticket });
  });

  // Super Admin: Change Support Ticket Status (when marked 'resolved', close and delete the case from the panel)
  app.post('/api/admin/support/tickets/:ticketId/status', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { ticketId } = req.params;
    const status = (req.body?.status || 'resolved') as SupportTicket['status'];
    await store.syncFromCloud();
    const db = store.getState();
    const ticket = (db.supportTickets || []).find((t) => t.ticketId === ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Biseda e supportit nuk u gjet.' });
      return;
    }

    if (status === 'resolved') {
      const targetUserId = ticket.userId;
      store.markDeleted(ticketId);
      db.supportTickets = (db.supportTickets || []).filter((t) => t.ticketId !== ticketId);
      await store.commitAsync();
      broadcastSupportUpdate({
        event: 'ticket_resolved_deleted',
        ticketId,
        userId: targetUserId,
      });
      res.json({
        ok: true,
        resolvedAndDeleted: true,
        deletedTicketId: ticketId,
        tickets: getCleanActiveSupportTickets(db),
      });
      return;
    }

    const nowIso = new Date().toISOString();
    ticket.status = status;
    ticket.updatedAt = nowIso;
    ticket.unreadByAdmin = 0;

    const statusLabel =
      ticket.status === 'ai_active'
        ? 'Biseda u kalua përsëri te Asistenti AI (Gemini).'
        : 'Agjenti Njerëzor mori përsipër bisedën.';

    ticket.messages.push({
      messageId: `msg_sys_${Date.now()}`,
      ticketId: ticket.ticketId,
      senderRole: 'system',
      senderName: 'Sistemi MITO',
      text: statusLabel,
      createdAt: nowIso,
    });

    await store.commitAsync();
    broadcastSupportUpdate({
      event: 'status_changed',
      ticketId: ticket.ticketId,
      userId: ticket.userId,
    });
    res.json({ ticket });
  });

  // Super Admin: Explicitly Delete/Close Support Ticket
  app.delete('/api/admin/support/tickets/:ticketId', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { ticketId } = req.params;
    await store.syncFromCloud();
    const db = store.getState();
    const existing = (db.supportTickets || []).find((t) => t.ticketId === ticketId);
    store.markDeleted(ticketId);
    db.supportTickets = (db.supportTickets || []).filter((t) => t.ticketId !== ticketId);
    await store.commitAsync();
    broadcastSupportUpdate({
      event: 'ticket_deleted',
      ticketId,
      userId: existing?.userId,
    });
    res.json({
      ok: true,
      deletedTicketId: ticketId,
      tickets: getCleanActiveSupportTickets(db),
    });
  });

  // Delete User Account
  const handleDeleteUserById = async (req: AuthenticatedRequest, res: Response) => {
    const { uid } = req.params;
    const db = store.getState();
    store.markDeleted([
      uid,
      ...db.activeSessions.filter((s) => s.userId === uid).map((s) => s.sessionId),
      ...db.playbackProgress.filter((p) => p.userId === uid).map((p) => p.progressId),
      ...db.leaderboardEntries.filter((e) => e.userId === uid).map((e) => e.entryId),
    ]);
    db.users = db.users.filter((u) => u.uid !== uid || u.role === 'super_admin');
    db.activeSessions = db.activeSessions.filter((s) => s.userId !== uid);
    db.playbackProgress = db.playbackProgress.filter((p) => p.userId !== uid);
    db.leaderboardEntries = db.leaderboardEntries.filter((e) => e.userId !== uid);
    await store.commitAsync();
    res.json({ ok: true });
  };
  app.delete('/api/admin/users/:uid', requireAdmin, handleDeleteUserById);
  app.post('/api/admin/users/:uid/delete', requireAdmin, handleDeleteUserById);

  // Moderate Leaderboard Entry
  const handleDeleteLeaderboardById = async (req: AuthenticatedRequest, res: Response) => {
    const { entryId } = req.params;
    const db = store.getState();
    store.markDeleted(entryId);
    db.leaderboardEntries = db.leaderboardEntries.filter((e) => e.entryId !== entryId);
    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'LEADERBOARD_MODERATED',
      targetId: entryId,
      details: `U fshi rekordi i renditjes ${entryId}.`,
      severity: 'warning',
    });
    await store.commitAsync();
    res.json({ ok: true });
  };
  app.delete('/api/admin/leaderboard/:entryId', requireAdmin, handleDeleteLeaderboardById);
  app.post('/api/admin/leaderboard/:entryId/delete', requireAdmin, handleDeleteLeaderboardById);

  // Update Site Settings
  app.put('/api/admin/settings', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const db = store.getState();
    db.siteSettings = {
      ...db.siteSettings,
      ...(req.body || {}),
      updatedAt: new Date().toISOString(),
    };
    await store.commitAsync();
    res.json({ siteSettings: db.siteSettings });
  });

  // Optional Gemini AI Assistant for Super Admin (with automatic built-in Albanian Heritage Editorial fallback so no secret keys are ever required)
  app.post('/api/admin/ai/assist', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const { task, inputText } = req.body || {};
    const cleanText = String(inputText || '').trim();
    const apiKey = process.env.GEMINI_API_KEY;

    const buildFallbackQuestions = (source: string) => {
      const topic = source.length > 10 ? source.slice(0, 60) : 'Legjendat dhe Trashëgimia Shqiptare';
      return [
        {
          questionText: `Cila vlerë themelore qëndron në qendër të rrëfimit "${topic}"?`,
          choices: ['Besa dhe fjala e dhënë', 'Tregtia detare', 'Lundrimi dimëror', 'Arkitektura moderne'],
          correctChoiceIndex: 0,
          explanation: 'Në traditën shqiptare, Besa dhe mbajtja e fjalës së dhënë përbëjnë boshtin moral të legjendave.',
        },
        {
          questionText: 'Në cilin qytet ndodhet Kalaja historike e Rozafës?',
          choices: ['Shkodër', 'Berat', 'Gjirokastër', 'Krujë'],
          correctChoiceIndex: 0,
          explanation: 'Kalaja e Rozafës ngrihet mbi një kodër shkëmbore në hyrje të qytetit të Shkodrës, pranë lumenjve Buna, Drin dhe Kir.',
        },
        {
          questionText: 'Cili hero legjendar i epikës shqiptare njihet për forcën mbinatyrore në Këngët e Kreshnikëve?',
          choices: ['Muji dhe Halili', ' Gjergj Elez Alia', 'Konstandini i Vogël', 'Të gjithë të përmendurit'],
          correctChoiceIndex: 3,
          explanation: 'Muji, Halili, Gjergj Elez Alia dhe Konstandini janë figura qendrore të epikës dhe baladave shqiptare.',
        },
        {
          questionText: 'Cila valle tradicionale shqiptare është pjesë e trashëgimisë botërore UNESCO?',
          choices: ['Kcimi i Tropojës', 'Vallja Moderne', 'Valsi Vjenez', 'Polka Nordike'],
          correctChoiceIndex: 0,
          explanation: 'Kcimi i Tropojës dhe Iso-Polifonia shqiptare njihen nga UNESCO si kryevepra të trashëgimisë shpirtërore.',
        },
      ];
    };

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      if (task === 'generate_quiz') {
        res.json({
          draftNoticeSq:
            'Këto 4 pyetje u gjeneruan automatikisht nga Motori Editorial Kulturor MITO (pa pasur nevojë për çelës sekret).',
          questions: buildFallbackQuestions(cleanText),
        });
        return;
      }
      res.json({
        draftNoticeSq:
          'Sugjerimet u gjeneruan automatikisht nga Motori Editorial Kulturor MITO.',
        suggestions: {
          suggestedCategory: 'Legjenda Shqiptare',
          suggestedSynopsis:
            cleanText.slice(0, 180) ||
            'Një rrëfim autentik mbi besën, sakrificën dhe trashëgiminë kulturore shqiptare.',
          suggestedTags: ['legjenda', 'besa', 'trashëgimia', 'shqipëri'],
          suggestedDifficulty: 'mesatare',
          editorialWarning: '',
        },
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      if (task === 'generate_quiz') {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Bazuar VETËM në këtë tekst burimor kulturor shqiptar, krijo 4 pyetje kuizi me 4 alternativa në gjuhën shqipe. Mos shpik fakte jashtë tekstit:\n\n${cleanText.slice(0, 4000)}`,
          config: {
            systemInstruction:
              'Ti je një redaktor kulturor për platformën e trashëgimisë shqiptare MITO. Krijo draft-pyetje kuizi në shqip pa shpikur burime ose fakte të paverifikuara.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionText: { type: Type.STRING },
                  choices: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctChoiceIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
              },
            },
          },
        });
        const questions = JSON.parse((response.text ?? '[]').trim());
        res.json({
          draftNoticeSq:
            'Këto pyetje janë gjeneruar si DRAFT nga Asistenti AI. Verifikoni saktësinë historike dhe kulturore para publikimit.',
          questions: Array.isArray(questions) && questions.length > 0 ? questions : buildFallbackQuestions(cleanText),
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Analizo këtë përshkrim të trashëgimisë kulturore shqiptare dhe sugjero në shqip një përmbledhje të shkurtër (synopsis), etiketa (tags), kategori dhe nivel vështirësie:\n\n${cleanText.slice(0, 4000)}`,
        config: {
          systemInstruction:
            'Ti je asistenti editorial i platformës shqiptare MITO. Mos trilloni fakte historike apo burime. Kthe përgjigje në JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedCategory: { type: Type.STRING },
              suggestedSynopsis: { type: Type.STRING },
              suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
              suggestedDifficulty: { type: Type.STRING },
              editorialWarning: { type: Type.STRING },
            },
          },
        },
      });
      const suggestions = JSON.parse((response.text ?? '{}').trim());
      res.json({
        draftNoticeSq:
          'Sugjerimet e mëposhtme janë DRAFT dhe kërkojnë miratimin e Super Administratorit.',
        suggestions,
      });
    } catch {
      if (task === 'generate_quiz') {
        res.json({
          draftNoticeSq:
            'Këto 4 pyetje u gjeneruan automatikisht nga Motori Editorial Kulturor MITO.',
          questions: buildFallbackQuestions(cleanText),
        });
        return;
      }
      res.json({
        draftNoticeSq: 'Sugjerimet u gjeneruan automatikisht.',
        suggestions: {
          suggestedCategory: 'Legjenda Shqiptare',
          suggestedSynopsis: cleanText.slice(0, 180) || 'Trashëgimia kulturore shqiptare.',
          suggestedTags: ['legjenda', 'shqipëri'],
          suggestedDifficulty: 'mesatare',
          editorialWarning: '',
        },
      });
    }
  });

  // 1-Click Cultural Starter Pack Seeder (Syncs Google Drive Video, Categories, BESA Questionnaire & Demo User)
  app.post('/api/admin/seed-heritage-pack', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const db = store.getState();
    const nowIso = new Date().toISOString();

    store.unmarkDeleted([
      'cat_legjenda',
      'cat_histori',
      'cat_mitologji',
      'cat_tradita',
      'cnt_1793701774719_0bebb6e7',
      'media_1793701333969_28662594',
      'game_besa_quiz',
      'q_besa_1',
      'q_besa_2',
      'q_besa_3',
      'q_besa_4',
      'usr_demo_shkoder',
    ]);

    // 1. Categories
    if (db.categories.length === 0) {
      db.categories.push(
        {
          categoryId: 'cat_legjenda',
          name: 'Legjenda Shqiptare',
          slug: 'legjenda',
          description: 'Rrëfime të pavdekshme mbi besën, sakrificën dhe kështjellat tona.',
          iconName: 'Compass',
          order: 1,
          createdAt: nowIso,
        },
        {
          categoryId: 'cat_histori',
          name: 'Histori Kombëtare',
          slug: 'histori',
          description: 'Ngjarje historike, figura të shquara dhe epoka e Skënderbeut.',
          iconName: 'Shield',
          order: 2,
          createdAt: nowIso,
        },
        {
          categoryId: 'cat_mitologji',
          name: 'Mitologji & Folklor',
          slug: 'mitologji',
          description: 'Këngët e Kreshnikëve, Zanat e maleve dhe mitologjia ilire-shqiptare.',
          iconName: 'Sparkles',
          order: 3,
          createdAt: nowIso,
        },
        {
          categoryId: 'cat_tradita',
          name: 'Tradita & Valle',
          slug: 'tradita',
          description: 'Veshje popullore, Kcimi i Tropojës, Iso-Polifonia dhe zakonet.',
          iconName: 'Award',
          order: 4,
          createdAt: nowIso,
        }
      );
    }

    // 2. Ensure Google Drive video & BESA questionnaire are synced and legacy uploads are removed
    ensureGoogleDriveCatalogState();

    // 3. Demo User Account (Code: 222-333-444)
    if (!db.users.some((u) => u.role === 'user')) {
      const demoSalt = 'mito_demo_user_salt';
      const demoHash = hashAccessCode('222333444', demoSalt, PEPPER);
      const demoUser: UserAccount = {
        uid: 'usr_demo_shkoder',
        codeHash: demoHash,
        codeSalt: demoSalt,
        maskedCode: '***-***-444',
        fullCode: '222-333-444',
        role: 'user',
        status: 'active',
        displayName: 'Arben Shkodra (Akses i Plotë)',
        avatar: 'eagle',
        createdAt: nowIso,
        firstLoginAt: nowIso,
        accessActivatedAt: nowIso,
        lastLoginAt: nowIso,
        accessPolicy: createAccessPolicyPreset('full'),
        stats: {
          totalXp: 350,
          totalPoints: 1200,
          gamesPlayed: 2,
          gamesWon: 2,
          correctAnswers: 8,
          totalAnswers: 8,
          accuracyPercent: 100,
          currentStreak: 4,
          bestStreak: 4,
          rank: 1,
          country: 'Shqipëri',
          school: 'Gjimnazi 28 Nëntori, Shkodër',
          watchedSecondsToday: 180,
          gameSessionsToday: 1,
          lastActivityDate: nowIso.slice(0, 10),
        },
        achievements: ['ach_first_explore'],
        likedShortIds: [],
        savedContentIds: ['cnt_1793701774719_0bebb6e7'],
        recentActivity: [
          {
            id: 'act_seed_1',
            type: 'watch',
            title: 'Shikoi: BESA Short Film Higgsfield Global Film Festival Nominee OLL KORRECT (824p)',
            timestamp: nowIso,
          },
        ],
      };
      db.users.push(demoUser);
      syncLeaderboardForUser(demoUser);
    }

    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'STARTER_PACK_LOADED',
      details: 'U sinkronizua katalogu nga Google Drive, Kategoritë, Pyetësori BESA dhe Përdoruesi Demo (222-333-444).',
      severity: 'info',
    });
    await store.commitAsync();

    res.json({
      ok: true,
      demoUserCode: '222-333-444',
      messageSq:
        'Katalogu i Google Drive, Kategoritë, Pyetësori BESA dhe Përdoruesi Demo (Kodi: 222-333-444) u sinkronizuan me sukses!',
    });
  });

  // 1-Click Reset Platform to Empty State
  app.post('/api/admin/reset-empty', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const db = store.getState();
    store.markDeleted([
      ...db.content.map((c) => c.contentId),
      ...db.categories.map((c) => c.categoryId),
      ...db.episodes.map((e) => e.episodeId),
      ...db.mediaAssets.map((a) => a.assetId),
      ...db.games.map((g) => g.gameId),
      ...db.gameQuestions.map((q) => q.questionId),
      ...db.playbackProgress.map((p) => p.progressId),
      ...db.leaderboardEntries.map((e) => e.entryId),
      ...db.users.filter((u) => u.role !== 'super_admin').map((u) => u.uid),
    ]);
    db.content = [];
    db.categories = [];
    db.episodes = [];
    db.mediaAssets = [];
    db.games = [];
    db.gameQuestions = [];
    db.playbackProgress = [];
    db.multiplayerRooms = [];
    db.leaderboardEntries = [];
    db.users = db.users.filter((u) => u.role === 'super_admin');
    store.addAuditLog({
      actorUid: req.user!.uid,
      actorRole: 'super_admin',
      action: 'PLATFORM_RESET_EMPTY',
      details: 'Platforma u kthye në gjendje plotësisht bosh nga Super Administratori.',
      severity: 'warning',
    });
    await store.commitAsync();
    res.json({ ok: true });
  });

  // =========================================================
  // 8. VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
  // =========================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MITO Full-Stack Platform running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
