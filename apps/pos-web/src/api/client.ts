import { posToken } from '../auth/token';
import {
  ApiRequestError,
  createApiClient,
  csrfHeadersForMutation,
  getApiOrigin,
  refreshCsrfCookie,
  resolveApiBaseUrl,
  xsrfHeaderFromCookie,
  type ApiRequestOptions,
} from '@shared/api';

export { ApiRequestError };

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

let _token: string | null = posToken.get();

export function setAuthToken(t: string | null): void {
  _token = t;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

const { request: _coreRequest } = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => _token,
  credentials: 'include',
});

/** Fired when the server refuses this till; usePosApp re-checks and locks. */
export const DEVICE_BLOCKED_EVENT = 'pos_device_blocked';

/**
 * Fired when the server refuses the person, not the till: something the till
 * offered (an order type, a button) they are no longer allowed. usePosApp
 * re-reads their permissions at once, since the till's copy may be older than
 * a change made in Admin.
 */
export const PERMISSIONS_STALE_EVENT = 'pos_permissions_stale';

const DEVICE_BLOCKED_CODES = new Set(['device_not_approved', 'device_rejected', 'device_disabled']);

function isDeviceBlockedCode(e: unknown): boolean {
  const body = e instanceof ApiRequestError ? e.body : undefined;
  const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
  return typeof code === 'string' && DEVICE_BLOCKED_CODES.has(code);
}

function deviceHeaders(): Record<string, string> {
  const deviceId = localStorage.getItem('pos_device_id');
  return deviceId ? { 'X-Device-Identifier': deviceId } : {};
}

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const csrfHeaders = method === 'GET' || method === 'HEAD'
    ? {}
    : await csrfHeadersForMutation(API_ORIGIN);
  const merged: ApiRequestOptions = {
    ...options,
    headers: {
      ...csrfHeaders,
      ...deviceHeaders(),
      ...(options.headers ?? {}),
    },
  };
  try {
    return await _coreRequest<T>(path, merged);
  } catch (e) {
    const status = e instanceof ApiRequestError ? e.status : (e as { status?: number })?.status;

    // Stale XSRF cookie (shared SESSION_DOMAIN) — refresh once and retry mutations.
    if (status === 419 && method !== 'GET' && method !== 'HEAD') {
      await refreshCsrfCookie(API_ORIGIN);
      return await _coreRequest<T>(path, {
        ...options,
        headers: {
          ...xsrfHeaderFromCookie(),
          ...deviceHeaders(),
          ...(options.headers ?? {}),
        },
      });
    }

    if (status === 401) {
      _token = null;
      posToken.clear();
      window.dispatchEvent(new Event('auth_expired'));
    }

    // The server refused this till (waiting for approval, rejected or
    // switched off): lock the screen now rather than at the next sign-in.
    if (status === 403 && isDeviceBlockedCode(e)) {
      window.dispatchEvent(new Event(DEVICE_BLOCKED_EVENT));
    } else if (status === 403) {
      window.dispatchEvent(new Event(PERMISSIONS_STALE_EVENT));
    }
    throw e;
  }
}
