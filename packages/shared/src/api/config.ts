// ── API base URL resolution ───────────────────────────────────────────────────
// Shared across staff apps (admin, POS, KDS) and customer apps.

export type ResolveApiBaseUrlOptions = {
  /** Value of `import.meta.env.VITE_API_BASE_URL` when set. */
  envUrl?: string;
  /** Value of `import.meta.env.PROD`. */
  prod?: boolean;
  /**
   * When the page is served from a non-local hostname but the configured
   * base URL still points at localhost, rewrite to same-origin `/api`.
   * POS bundles built with dev env vars need this guard on deployed hosts.
   */
  rewriteLocalhostOnRemotePage?: boolean;
};

/** Resolve the `/api` prefix used by `createApiClient`. */
export function resolveApiBaseUrl(options: ResolveApiBaseUrlOptions = {}): string {
  const prod = options.prod ?? false;
  const defaultForMode = prod ? '/api' : 'http://localhost:8000/api';
  let base = options.envUrl ?? defaultForMode;

  if (options.rewriteLocalhostOnRemotePage && typeof window !== 'undefined') {
    const h = window.location.hostname;
    const pageIsLocal = h === 'localhost' || h === '127.0.0.1';
    const baseLooksLocal =
      base.includes('localhost') || base.includes('127.0.0.1');
    if (!pageIsLocal && baseLooksLocal) {
      base = '/api';
    }
  }

  return base;
}

/** Strip the `/api` suffix to get the origin used for assets and Sanctum CSRF. */
export function getApiOrigin(baseUrl: string, prodFallback = ''): string {
  const stripped = baseUrl.replace(/\/api\/?$/, '');
  if (stripped) return stripped;
  return prodFallback;
}
