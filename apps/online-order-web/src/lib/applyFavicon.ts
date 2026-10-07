const FALLBACK_FAVICON = '/order/favicon-32.png';

/**
 * Point the document favicon at the CMS brand asset (or the flame favicon when unset).
 * Updates every <link rel="icon"> (the page ships an .ico and a 32px PNG, and a
 * browser may use either); creates one when there is none.
 */
export function applyFavicon(url: string | undefined | null): void {
  const href = (url && String(url).trim()) || FALLBACK_FAVICON;
  const head = document.head;
  let links = Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    head.appendChild(link);
    links = [link];
  }
  for (const link of links) {
    link.href = href;
    // The shipped sizes and types describe the shipped files, not this one.
    link.removeAttribute('sizes');
    if (/\.png($|\?)/i.test(href)) link.type = 'image/png';
    else link.removeAttribute('type');
  }
}
