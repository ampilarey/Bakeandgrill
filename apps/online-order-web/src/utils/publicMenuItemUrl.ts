import { API_ORIGIN } from '../api';

/**
 * Canonical public item URL for sharing.
 *
 * Crawlers get OG tags from the Blade document at /menu/{id}, not from the
 * /order SPA. Always share that origin — never an /order/... path.
 */
export function publicMenuItemUrl(itemId: number): string {
  const fromApi = (API_ORIGIN || '').replace(/\/$/, '');
  const origin = fromApi
    || (typeof window !== 'undefined' ? window.location.origin : '');

  return `${origin}/menu/${itemId}`;
}
