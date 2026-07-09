/** Read a cookie value in the browser (no-op during SSR). */
export function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

/** Build the X-XSRF-TOKEN header from the XSRF-TOKEN cookie, if present. */
export function xsrfHeaderFromCookie(): Record<string, string> {
  const xsrf = readBrowserCookie('XSRF-TOKEN');
  return xsrf ? { 'X-XSRF-TOKEN': xsrf } : {};
}

/** Fetch a fresh Sanctum CSRF cookie (required for stateful API POSTs). */
export async function refreshCsrfCookie(apiOrigin: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  await fetch(`${apiOrigin}/sanctum/csrf-cookie`, {
    credentials: 'include',
    cache: 'no-store',
  });
}

/**
 * Ensure a fresh CSRF cookie and return headers for mutating API requests.
 *
 * Always primes `/sanctum/csrf-cookie` before reading the cookie. Reusing a
 * stale XSRF-TOKEN (e.g. shared SESSION_DOMAIN across test/prod) causes 419
 * CSRF token mismatch on Sanctum stateful domains.
 */
export async function csrfHeadersForMutation(apiOrigin: string): Promise<Record<string, string>> {
  await refreshCsrfCookie(apiOrigin);
  let headers = xsrfHeaderFromCookie();
  if (headers['X-XSRF-TOKEN']) {
    return headers;
  }

  // Some browsers commit Set-Cookie asynchronously after fetch() resolves.
  await refreshCsrfCookie(apiOrigin);
  return xsrfHeaderFromCookie();
}
