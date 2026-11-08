const STORAGE_KEY = 'mito_session_token_v1';
const DEVICE_ID_KEY = 'mito_device_id_v1';
let memorySessionToken: string | null = null;
let memoryDeviceId: string | null = null;

export function getOrCreateDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored && stored.length >= 6) {
      memoryDeviceId = stored;
      return stored;
    }
    const generated = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36).slice(-4)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
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
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      memorySessionToken = stored;
      return stored;
    }
  } catch {
    // Ignore storage restriction in strict cross-origin iframe
  }
  return null;
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
    // Ignore storage restriction in strict cross-origin iframe
  }
}

export function appendTokenToUrl(url: string): string {
  const token = getSessionToken();
  if (!token || !url) return url;
  if (url.includes('token=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/**
 * Safe wrapper around native fetch that attaches X-Mito-Session, X-Mito-Device-Id, Authorization headers,
 * and ?token= query parameter without mutating window.fetch.
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
    } catch {
      // Ignore non-JSON response
    }
  }

  if (isApiCall && urlStr.includes('/api/auth/logout')) {
    setSessionToken(null);
  }

  return response;
}

export function installAuthFetchInterceptor(): void {
  // No-op: we use apiFetch directly and never mutate window.fetch
}
