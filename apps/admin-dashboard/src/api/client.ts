import { createApiClient, resolveApiBaseUrl } from '@shared/api';

export const ADMIN_TOKEN_KEY = 'admin_token';

export const BASE = resolveApiBaseUrl({
  envUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
  prod: import.meta.env.PROD,
});

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error('[CONFIG] VITE_API_BASE_URL is not set in production — all API calls will fail if the app is not served from the same origin as the API.');
}

/**
 * Security TODO: `admin_token` in localStorage is readable by any XSS on this origin.
 * Future hardening: migrate to Sanctum stateful SPA auth (`/sanctum/csrf-cookie`,
 * `credentials: 'include'`) and teach `EnsureStaffToken` to accept session-authenticated
 * staff without a bearer token carrying the `staff` ability. POS/KDS intentionally
 * keep bearer tokens for offline/device use.
 */
const { request: req, requestBlob } = createApiClient({
  baseUrl: BASE,
  getToken: () => localStorage.getItem(ADMIN_TOKEN_KEY),
});

export { req, requestBlob };

export function getStoredAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * Generic authenticated request helper for ad-hoc admin API calls.
 * Uses the same token and base URL as all other admin requests.
 */
export async function adminRequest<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return req(path, options);
}

/** Generic passthrough used by AnalyticsPage for dynamic report paths. */
export async function getAnalytics<T>(path: string): Promise<T> {
  return req(path);
}
