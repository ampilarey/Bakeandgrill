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

/**
 * Drop XSRF-TOKEN cookies that may belong to a sibling host.
 *
 * With SESSION_DOMAIN=.bakeandgrill.mv, prod and test share parent-domain
 * cookies. A stale prod XSRF-TOKEN on test.bakeandgrill.mv causes Laravel 419
 * "CSRF token mismatch" even after /sanctum/csrf-cookie.
 */
export function clearConflictingXsrfCookies(): void {
  if (typeof document === 'undefined' || typeof location === 'undefined') {
    return;
  }

  const expire = 'Max-Age=0; path=/';
  document.cookie = `XSRF-TOKEN=; ${expire}`;

  const host = location.hostname;
  if (host && host !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    document.cookie = `XSRF-TOKEN=; ${expire}; domain=${host}`;
    const parts = host.split('.');
    if (parts.length >= 2) {
      const parent = `.${parts.slice(-2).join('.')}`;
      document.cookie = `XSRF-TOKEN=; ${expire}; domain=${parent}`;
    }
  }
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
 * Clears conflicting parent-domain XSRF cookies, then primes
 * `/sanctum/csrf-cookie` before reading the token.
 */
export async function csrfHeadersForMutation(apiOrigin: string): Promise<Record<string, string>> {
  clearConflictingXsrfCookies();
  await refreshCsrfCookie(apiOrigin);
  let headers = xsrfHeaderFromCookie();
  if (headers['X-XSRF-TOKEN']) {
    return headers;
  }

  // Some browsers commit Set-Cookie asynchronously after fetch() resolves.
  await refreshCsrfCookie(apiOrigin);
  return xsrfHeaderFromCookie();
}
