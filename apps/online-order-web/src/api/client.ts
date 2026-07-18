// ── Shared API client instance ─────────────────────────────────────────────────
// Session cookie auth (Sanctum stateful SPA) — no Bearer tokens in localStorage.

import {
  ApiRequestError,
  createApiClient,
  csrfHeadersForMutation,
  refreshCsrfCookie,
  xsrfHeaderFromCookie,
  type ApiRequestOptions,
} from '@shared/api';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

/** Base URL for images/assets (same origin as API, without /api suffix). */
export const API_ORIGIN =
  API_BASE_URL.replace(/\/api\/?$/, '') ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

/** Always re-prime CSRF before mutations — stale XSRF cookies cause 419s. */
export async function ensureCsrfCookie(): Promise<void> {
  await refreshCsrfCookie(API_ORIGIN);
}

const { request: coreRequest } = createApiClient({
  baseUrl: API_BASE_URL,
  credentials: 'include',
});

async function withCsrf(options: ApiRequestOptions = {}): Promise<ApiRequestOptions> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return options;
  }
  return {
    ...options,
    headers: {
      ...(await csrfHeadersForMutation(API_ORIGIN)),
      ...(options.headers ?? {}),
    },
  };
}

/**
 * Mutating calls get a fresh CSRF cookie; on 419 (stale sibling-host XSRF),
 * re-prime once and retry — same pattern as admin-dashboard.
 */
export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const prepared = await withCsrf(options);
  try {
    return await coreRequest<T>(path, prepared);
  } catch (e) {
    const status = e instanceof ApiRequestError ? e.status : (e as { status?: number })?.status;
    if (status === 419 && method !== 'GET' && method !== 'HEAD') {
      await csrfHeadersForMutation(API_ORIGIN);
      return coreRequest<T>(path, {
        ...options,
        headers: {
          ...xsrfHeaderFromCookie(),
          ...(options.headers ?? {}),
        },
      });
    }
    throw e;
  }
}
