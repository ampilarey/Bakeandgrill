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

/** Legacy key — cleared on boot so old PATs are not reused after cookie migration. */
const LEGACY_ADMIN_TOKEN_KEY = 'admin_token';

export const BASE = resolveApiBaseUrl({
  // Prefer same-origin `/api` so Sanctum session + CSRF cookies stay first-party
  // (Vite proxies `/api` and `/sanctum` in local dev).
  envUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api',
  prod: import.meta.env.PROD,
});

const API_ORIGIN = getApiOrigin(BASE);

/** Public origin for resolving /storage media URLs in the admin UI. */
export function getAdminApiOrigin(): string {
  return API_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
}

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.error('[CONFIG] VITE_API_BASE_URL is not set in production — all API calls will fail if the app is not served from the same origin as the API.');
}

// One-time cleanup after migrating off localStorage Bearer tokens.
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

const { request: coreRequest, requestBlob: coreRequestBlob } = createApiClient({
  baseUrl: BASE,
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

async function withCsrfRetry<T>(
  run: (opts: ApiRequestOptions) => Promise<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const prepared = await withCsrf(options);
  try {
    return await run(prepared);
  } catch (e) {
    const status = e instanceof ApiRequestError ? e.status : (e as { status?: number })?.status;
    if (status === 419 && method !== 'GET' && method !== 'HEAD') {
      await refreshCsrfCookie(API_ORIGIN);
      return run({
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

export async function req<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return withCsrfRetry((opts) => coreRequest<T>(path, opts), options);
}

export async function requestBlob(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
  return withCsrfRetry((opts) => coreRequestBlob(path, opts), options);
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
