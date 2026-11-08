import type { UserAccount } from '../types/mito';

const STORAGE_KEY = 'mito_session_token_v1';
const DEVICE_ID_KEY = 'mito_device_id_v1';
const USER_UID_KEY = 'mito_user_uid_v1';
const SAVED_CODE_KEY = 'mito_saved_code_v1';
const CACHED_USER_KEY = 'mito_cached_user_v1';

const CLIENT_TOKEN_COOKIE = 'mito_client_token';
const CLIENT_UID_COOKIE = 'mito_client_uid';
const CLIENT_CODE_COOKIE = 'mito_client_code';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

let memorySessionToken: string | null = null;
let memoryDeviceId: string | null = null;
let memoryUserUid: string | null = null;
let memorySavedCode: string | null = null;

function setClientCookie(name: string, value: string | null): void {
  if (typeof document === 'undefined') return;
  try {
    const isSecure = window.location.protocol === 'https:';
    const sameSite = isSecure ? 'None; Secure' : 'Lax';
    if (value) {
      document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=${sameSite}`;
    } else {
      document.cookie = `${name}=; max-age=0; path=/; SameSite=${sameSite}`;
    }
  } catch {
    // Ignore cookie errors
  }
}

function getClientCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function getOrCreateDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY) || getClientCookie(DEVICE_ID_KEY);
    if (stored && stored.length >= 6) {
      memoryDeviceId = stored;
      window.localStorage.setItem(DEVICE_ID_KEY, stored);
      setClientCookie(DEVICE_ID_KEY, stored);
      return stored;
    }
    const generated = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36).slice(-4)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
    setClientCookie(DEVICE_ID_KEY, generated);
    memoryDeviceId = generated;
    return generated;
  } catch {
    if (!memoryDeviceId) {
      memoryDeviceId = `dev_${Math.random().toString(36).slice(2, 10)}`;
    }
    return memoryDeviceId;
  }
}

export function getSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) || getClientCookie(CLIENT_TOKEN_COOKIE);
    if (stored) {
      memorySessionToken = stored;
      window.localStorage.setItem(STORAGE_KEY, stored);
      return stored;
    }
  } catch {
    // Ignore storage restriction
  }
  return getClientCookie(CLIENT_TOKEN_COOKIE);
}

export function setSessionToken(token: string | null): void {
  memorySessionToken = token;
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction
  }
  setClientCookie(CLIENT_TOKEN_COOKIE, token);
}

export function getPersistedUserUid(): string | null {
  if (memoryUserUid) return memoryUserUid;
  try {
    const stored = window.localStorage.getItem(USER_UID_KEY) || getClientCookie(CLIENT_UID_COOKIE);
    if (stored) {
      memoryUserUid = stored;
      return stored;
    }
  } catch {
    // Ignore
  }
  return getClientCookie(CLIENT_UID_COOKIE);
}

export function setPersistedUserUid(uid: string | null): void {
  memoryUserUid = uid;
  try {
    if (uid) {
      window.localStorage.setItem(USER_UID_KEY, uid);
    } else {
      window.localStorage.removeItem(USER_UID_KEY);
    }
  } catch {
    // Ignore
  }
  setClientCookie(CLIENT_UID_COOKIE, uid);
}

export function getPersistedAccessCode(): string | null {
  if (memorySavedCode) return memorySavedCode;
  try {
    const stored = window.localStorage.getItem(SAVED_CODE_KEY) || getClientCookie(CLIENT_CODE_COOKIE);
    if (stored) {
      memorySavedCode = stored;
      return stored;
    }
  } catch {
    // Ignore
  }
  return getClientCookie(CLIENT_CODE_COOKIE);
}

export function setPersistedAccessCode(code: string | null): void {
  const clean = code && !code.includes('*') ? code.trim() : null;
  memorySavedCode = clean;
  try {
    if (clean) {
      window.localStorage.setItem(SAVED_CODE_KEY, clean);
    } else if (code === null) {
      window.localStorage.removeItem(SAVED_CODE_KEY);
    }
  } catch {
    // Ignore
  }
  if (clean || code === null) {
    setClientCookie(CLIENT_CODE_COOKIE, clean);
  }
}

export function getCachedUser(): UserAccount | null {
  try {
    const raw = window.localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserAccount;
    if (parsed && parsed.uid && parsed.role) {
      return parsed;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function setCachedUser(user: UserAccount | null): void {
  try {
    if (user && user.uid) {
      window.localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
      setPersistedUserUid(user.uid);
      if (user.fullCode && !user.fullCode.includes('*')) {
        setPersistedAccessCode(user.fullCode);
      }
    } else {
      window.localStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // Ignore
  }
}

export function clearAllPersistedAuth(): void {
  setSessionToken(null);
  setPersistedUserUid(null);
  setPersistedAccessCode(null);
  setCachedUser(null);
}

export function appendTokenToUrl(url: string): string {
  const token = getSessionToken();
  if (!token || !url) return url;
  if (url.includes('token=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/**
 * Safe wrapper around native fetch that attaches X-Mito-Session, X-Mito-Device-Id,
 * X-Mito-User-Uid, X-Mito-Saved-Code, and Authorization headers so sessions persist across updates.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
  const nextInit: RequestInit = { ...(init || {}) };
  let finalInput: RequestInfo | URL = input;

  if (isApiCall) {
    const headers = new Headers(nextInit.headers || {});
    const deviceId = getOrCreateDeviceId();
    if (deviceId && !headers.has('X-Mito-Device-Id')) {
      headers.set('X-Mito-Device-Id', deviceId);
    }
    const userUid = getPersistedUserUid() || getCachedUser()?.uid || null;
    if (userUid && !headers.has('X-Mito-User-Uid')) {
      headers.set('X-Mito-User-Uid', userUid);
    }
    const savedCode = getPersistedAccessCode() || getCachedUser()?.fullCode || null;
    if (savedCode && !savedCode.includes('*') && !headers.has('X-Mito-Saved-Code')) {
      headers.set('X-Mito-Saved-Code', savedCode);
    }
    const token = getSessionToken();
    if (token) {
      if (!headers.has('X-Mito-Session')) {
        headers.set('X-Mito-Session', token);
      }
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (typeof input === 'string') {
        finalInput = appendTokenToUrl(input);
      }
    }
    nextInit.headers = headers;
    nextInit.credentials = 'include';
  }

  const response = await window.fetch(finalInput, nextInit);

  if (
    isApiCall &&
    (urlStr.includes('/api/auth/login') ||
      urlStr.includes('/api/auth/bootstrap') ||
      urlStr.includes('/api/auth/session'))
  ) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      if (data && typeof data.sessionToken === 'string' && data.sessionToken.length > 0) {
        setSessionToken(data.sessionToken);
      }
      if (data && data.user && data.user.uid) {
        setCachedUser(data.user);
      }
      if (data && data.explicitlyRevoked) {
        clearAllPersistedAuth();
      }
    } catch {
      // Ignore non-JSON response
    }
  }

  if (isApiCall && urlStr.includes('/api/auth/logout')) {
    clearAllPersistedAuth();
  }

  return response;
}

export function installAuthFetchInterceptor(): void {
  // No-op: we use apiFetch directly and never mutate window.fetch
}
