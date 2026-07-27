const FALLBACK_FAVICON = '/logo.png';

/**
 * Point the document favicon at the CMS brand asset (or /logo.png when unset).
 * Updates an existing <link rel="icon"> when present; otherwise creates one.
 */
export function applyFavicon(url: string | undefined | null): void {
  const href = (url && String(url).trim()) || FALLBACK_FAVICON;
  const head = document.head;
  let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    head.appendChild(link);
  }
  link.href = href;
  if (!link.type && /\.png($|\?)/i.test(href)) {
    link.type = 'image/png';
  }
}
