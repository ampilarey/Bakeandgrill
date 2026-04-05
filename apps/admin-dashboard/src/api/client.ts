import { createApiClient } from '@shared/api';

export const BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error('[CONFIG] VITE_API_BASE_URL is not set in production — all API calls will fail if the app is not served from the same origin as the API.');
}

const { request: req } = createApiClient({
  baseUrl: BASE,
  getToken: () => localStorage.getItem('admin_token'),
});

export { req };

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

/** Alias used by pages that need dynamic paths. */
export async function apiRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  return req(path, opts);
}

/** Generic passthrough used by AnalyticsPage for dynamic report paths. */
export async function getAnalytics<T>(path: string): Promise<T> {
  return req(path);
}
