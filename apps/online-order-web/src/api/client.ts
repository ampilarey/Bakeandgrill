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
import { broadcastServiceUnavailable, toServiceUnavailableError } from './serviceUnavailable';

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
 * A read the server refused as too frequent (429) waits as long as the
 * server asked, up to this many seconds, and tries once more before the
 * page sees an error (UI audit, 2026-10-10: a refused menu read showed
 * "Couldn't load the menu. Check your connection").
 */
export const BUSY_RETRY_MAX_SECONDS = 8;
const BUSY_RETRY_DEFAULT_SECONDS = 2;

function busyWaitSeconds(e: unknown): number | null {
  if (!(e instanceof ApiRequestError) || e.status !== 429) return null;
  const asked = e.retryAfterSeconds ?? BUSY_RETRY_DEFAULT_SECONDS;
  return asked <= BUSY_RETRY_MAX_SECONDS ? Math.max(1, asked) : null;
}

async function readWithBusyRetry<T>(path: string, prepared: ApiRequestOptions, method: string): Promise<T> {
  try {
    return await coreRequest<T>(path, prepared);
  } catch (e) {
    const wait = method === 'GET' || method === 'HEAD' ? busyWaitSeconds(e) : null;
    if (wait === null) throw e;
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return coreRequest<T>(path, prepared);
  }
}

/** True when the server refused a request as too frequent, so callers can say "busy" rather than blame the connection. */
export function isBusyError(e: unknown): boolean {
  return e instanceof ApiRequestError && e.status === 429;
}

/**
 * Mutating calls get a fresh CSRF cookie; on 419 (stale sibling-host XSRF),
 * re-prime once and retry — same pattern as admin-dashboard.
 */
export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const prepared = await withCsrf(options);
  try {
    return await readWithBusyRetry<T>(path, prepared, method);
  } catch (e) {
    const status = e instanceof ApiRequestError ? e.status : (e as { status?: number })?.status;
    if (status === 419 && method !== 'GET' && method !== 'HEAD') {
      await csrfHeadersForMutation(API_ORIGIN);
      try {
        return await coreRequest<T>(path, {
          ...options,
          headers: {
            ...xsrfHeaderFromCookie(),
            ...(options.headers ?? {}),
          },
        });
      } catch (retryErr) {
        const typed = toServiceUnavailableError(retryErr);
        if (typed) {
          broadcastServiceUnavailable(typed);
          throw typed;
        }
        throw retryErr;
      }
    }
    const typed = toServiceUnavailableError(e);
    if (typed) {
      broadcastServiceUnavailable(typed);
      throw typed;
    }
    throw e;
  }
}
