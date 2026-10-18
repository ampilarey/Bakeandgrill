/**
 * Makes a newly picked Dhivehi font show on the next ordinary visit (owner, 2026-10-18:
 * "when new font is changed, it does not load, until closed and opened in private").
 *
 * index.html links /css/dhivehi-font.css?app=…, and that one address is kept by the
 * browser (Cloudflare gives it a 4-hour browser TTL), by the order app's service worker
 * and, for the app roots, by Apache serving the built index.html untouched. This asks
 * the server for the sheet past those caches and, when it differs, swaps the link for
 * one carrying the sheet's version (`v`, the first 12 hex of its sha1, as the server's
 * own `DhivehiFont::href()` writes it), which nothing has cached.
 */
const LINK_SELECTOR = 'link[rel="stylesheet"][href*="/css/dhivehi-font.css"]';

export function versionOf(etag: string | null, css: string): string {
  const sha = etag?.match(/[0-9a-f]{40}/i)?.[0];
  if (sha) return sha.slice(0, 12).toLowerCase();
  // No usable ETag (a proxy dropped it): any stable digest of the text will do.
  let h = 5381;
  for (let i = 0; i < css.length; i++) h = ((h << 5) + h + css.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(16);
}

export async function refreshDhivehiFont(doc: Document = document): Promise<void> {
  const link = doc.querySelector<HTMLLinkElement>(LINK_SELECTOR);
  if (!link) return;

  const current = new URL(link.href, doc.baseURI);
  const app = current.searchParams.get('app') === 'order_app' ? 'order_app' : 'website';

  let version: string;
  try {
    const res = await fetch(`/css/dhivehi-font.css?app=${app}`, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return;
    version = versionOf(res.headers.get('ETag'), await res.text());
  } catch {
    return; // offline: keep what loaded
  }
  if (current.searchParams.get('v') === version) return;

  const next = doc.createElement('link');
  next.rel = 'stylesheet';
  next.href = `/css/dhivehi-font.css?app=${app}&v=${version}`;
  // The old sheet stays until the new one has loaded, so nothing flashes.
  next.addEventListener('load', () => link.remove(), { once: true });
  link.after(next);
}
