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
 * Ensure a CSRF cookie exists and return headers for mutating API requests.
 * Always re-reads the cookie after priming — never caches a failed prime.
 */
export async function csrfHeadersForMutation(apiOrigin: string): Promise<Record<string, string>> {
  let headers = xsrfHeaderFromCookie();
  if (headers['X-XSRF-TOKEN']) {
    return headers;
  }

  await refreshCsrfCookie(apiOrigin);
  headers = xsrfHeaderFromCookie();
  if (headers['X-XSRF-TOKEN']) {
    return headers;
  }

  // One more try — some browsers commit cookies asynchronously after fetch().
  await refreshCsrfCookie(apiOrigin);
  return xsrfHeaderFromCookie();
}
