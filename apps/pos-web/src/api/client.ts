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

let _token: string | null = localStorage.getItem('pos_token');

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
      localStorage.removeItem('pos_token');
      window.dispatchEvent(new Event('auth_expired'));
    }
    throw e;
  }
}
