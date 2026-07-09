// ── Shared API client instance ─────────────────────────────────────────────────
// Session cookie auth (Sanctum stateful SPA) — no Bearer tokens in localStorage.

import { createApiClient } from '@shared/api';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

/** Base URL for images/assets (same origin as API, without /api suffix). */
export const API_ORIGIN =
  API_BASE_URL.replace(/\/api\/?$/, '') ||
  (import.meta.env.PROD ? '' : 'http://localhost:8000');

function readCookie(name: string): string | null {
  const m = document.cookie.split('; ').find((r) => r.startsWith(name + '='));
  return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : null;
}

/** Always re-prime CSRF before mutations — stale XSRF cookies cause 419s. */
export async function ensureCsrfCookie(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  await fetch(`${API_ORIGIN}/sanctum/csrf-cookie`, {
    credentials: 'include',
    cache: 'no-store',
  });
}

function xsrfHeaders(): Record<string, string> {
  const xsrf = readCookie('XSRF-TOKEN');
  return xsrf ? { 'X-XSRF-TOKEN': xsrf } : {};
}

const { request: coreRequest } = createApiClient({
  baseUrl: API_BASE_URL,
  credentials: 'include',
});

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    await ensureCsrfCookie();
  }

  return coreRequest<T>(path, {
    ...options,
    headers: {
      ...xsrfHeaders(),
      ...(options.headers ?? {}),
    },
  });
}
