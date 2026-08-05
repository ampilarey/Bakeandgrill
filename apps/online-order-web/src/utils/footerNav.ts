/**
 * Footer / legal link routing for the /order SPA.
 * Blade-only paths must use a plain <a href> so the browser leaves React Router.
 */

const LEAVE_ORDER_APP_PATHS = new Set(['/', '/terms', '/refund']);

/** True when this same-origin path should leave the /order SPA (Blade page or site root). */
export function shouldLeaveOrderApp(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//')) return false;
  const path = (url.split(/[?#]/)[0] || '/');
  return LEAVE_ORDER_APP_PATHS.has(path);
}

/** Strip a leading `/order` prefix so React Router (basename=/order) resolves correctly. */
export function toOrderSpaPath(url: string): string {
  if (url === '/order') return '/';
  if (url.startsWith('/order/')) return url.slice('/order'.length) || '/';
  return url;
}

/** Absolute / scheme URLs (open in new tab). */
export function isExternalHref(url: string): boolean {
  return /^(https?:|mailto:|tel:|viber:|whatsapp:)/i.test(url);
}
