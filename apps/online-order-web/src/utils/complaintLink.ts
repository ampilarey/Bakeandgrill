import { API_ORIGIN } from '../api';

/**
 * The complaint box lives on the website (/complain), one origin up from
 * the order app at /order. Every surface that offers it tags where it came
 * from, so the owner's Complaint Box shows "via app" or "via order".
 */
export type ComplaintSource = 'app' | 'order' | 'footer' | 'menu';

function siteOrigin(): string {
  if (/^https?:\/\//i.test(API_ORIGIN)) {
    try {
      return new URL(API_ORIGIN).origin;
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://bakeandgrill.mv';
}

export function complaintUrl(from: ComplaintSource, orderNumber?: string | null): string {
  const url = new URL('/complain', siteOrigin());
  url.searchParams.set('from', from);
  const ref = (orderNumber ?? '').trim();
  if (ref !== '') url.searchParams.set('order', ref);
  return url.toString();
}
