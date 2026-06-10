import {
  createApiClient,
  resolveApiBaseUrl,
  getApiOrigin,
  type ApiRequestOptions,
} from '@shared/api';

const API_BASE_URL = resolveApiBaseUrl({
  envUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
  prod: import.meta.env.PROD,
  rewriteLocalhostOnRemotePage: true,
});

const API_ORIGIN = getApiOrigin(API_BASE_URL);

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api');
}

// Module-level token — initialised from localStorage so page refresh
// doesn't silently log out the POS. Cleared on explicit logout.
//
// SECURITY DEBT (H9): storing the Sanctum token in localStorage exposes
// it to XSS exfiltration and to anyone with physical access to the iPad
// (e.g. via Safari → Develop → Storage). Production-grade fix is to move
// staff auth onto HttpOnly cookies with Sanctum's stateful flow, which
// requires:
//   - Sanctum SPA mode + sanctum/csrf-cookie endpoint
//   - SANCTUM_STATEFUL_DOMAINS env on the API
//   - withCredentials: true on every fetch
//   - Backend CORS + same-site cookie config
// That migration touches every app (pos, admin, online-order) plus the
// kiosk receipt flow — tracked as a separate effort. For now we mitigate
// with strict CSP on the kiosk Safari profile (no external scripts) and
// short-lived tokens (Sanctum default).
let _token: string | null = localStorage.getItem('pos_token');

export function setAuthToken(t: string | null): void {
  _token = t;
}

/** Shared base URL for fetch calls outside the authenticated api client. */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

function readCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : null;
}

let csrfPrimed = false;

/** Required for POST/PATCH/DELETE when Sanctum statefulApi() is enabled on this origin. */
async function ensureCsrfCookie(): Promise<void> {
  if (typeof window === 'undefined' || csrfPrimed) {
    return;
  }
  await fetch(`${API_ORIGIN}/sanctum/csrf-cookie`, { credentials: 'include' });
  csrfPrimed = true;
}

function xsrfHeaders(): Record<string, string> {
  const xsrf = readCookie('XSRF-TOKEN');
  return xsrf ? { 'X-XSRF-TOKEN': xsrf } : {};
}

const { request: _coreRequest } = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => _token,
  credentials: 'include',
});

async function withCsrf(options: ApiRequestOptions = {}): Promise<ApiRequestOptions> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return options;
  }
  await ensureCsrfCookie();
  return {
    ...options,
    headers: {
      ...xsrfHeaders(),
      ...(options.headers ?? {}),
    },
  };
}

// Wraps every API call: injects optional X-Device-Identifier for audit metadata.
export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const deviceId = localStorage.getItem('pos_device_id');
  const extraHeaders: HeadersInit = deviceId
    ? { 'X-Device-Identifier': deviceId }
    : {};
  const merged = await withCsrf({
    ...options,
    headers: { ...extraHeaders, ...(options.headers ?? {}) },
  });
  try {
    return await _coreRequest<T>(path, merged);
  } catch (e) {
    // Auth expiry: bubble a single global event the App listens for.
    // Without this, individual call sites silently log a 401 and the
    // cashier wonders why nothing works. ApiRequestError carries the
    // HTTP status from the shared client.
    const status = (e as { status?: number })?.status;
    if (status === 401) {
      _token = null;
      localStorage.removeItem('pos_token');
      window.dispatchEvent(new Event('auth_expired'));
    }
    throw e;
  }
}
