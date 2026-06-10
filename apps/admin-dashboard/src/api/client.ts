import {
  createApiClient,
  csrfHeadersForMutation,
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
  return {
    ...options,
    headers: {
      ...(await csrfHeadersForMutation(API_ORIGIN)),
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
