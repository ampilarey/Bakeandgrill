import {
  createApiClient,
  getApiOrigin,
  resolveApiBaseUrl,
  type ApiRequestOptions,
} from '@shared/api';

export const ADMIN_TOKEN_KEY = 'admin_token';

export const BASE = resolveApiBaseUrl({
  envUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
  prod: import.meta.env.PROD,
});

const API_ORIGIN = getApiOrigin(BASE);

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error('[CONFIG] VITE_API_BASE_URL is not set in production — all API calls will fail if the app is not served from the same origin as the API.');
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

/**
 * Security TODO: `admin_token` in localStorage is readable by any XSS on this origin.
 * Future hardening: migrate to Sanctum stateful SPA session auth without bearer tokens.
 * POS/KDS intentionally keep bearer tokens for offline/device use.
 */
const { request: coreRequest, requestBlob: coreRequestBlob } = createApiClient({
  baseUrl: BASE,
  getToken: () => localStorage.getItem(ADMIN_TOKEN_KEY),
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

export async function req<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return coreRequest<T>(path, await withCsrf(options));
}

export async function requestBlob(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
  return coreRequestBlob(path, await withCsrf(options));
}

export function getStoredAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export async function adminRequest<T = unknown>(
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  return req(path, options);
}

export async function getAnalytics<T>(path: string): Promise<T> {
  return req(path);
}
