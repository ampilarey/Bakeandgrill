import { useEffect } from 'react';
import { useHref, useLocation } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';

/**
 * The URL a page calls its own: this origin, this path, no query, no hash,
 * no trailing slash except at the root.
 *
 * Audit, 2026-09-17: index.html hardcoded `https://test.bakeandgrill.mv/order/`
 * as the canonical and og:url of every page — the TEST site, on production,
 * and the same one URL for the menu, events and gift cards alike. So search
 * engines were told the live site was a copy of the test one, and no inner
 * page could rank as itself.
 */
export function canonicalUrlFor(origin: string, pathname: string): string {
  const path = pathname.replace(/\/+$/, '');
  return `${origin}${path === '' ? '/' : path}`;
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setMeta(property: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.content = content;
}

/**
 * Sets the document title to `${title} — {site_name}`, and the page's
 * canonical and og:url to the address it is actually at.
 * Pass null to use just the site name.
 */
export function usePageTitle(title: string | null) {
  const { site_name } = useSiteSettings();
  const { pathname } = useLocation();
  // The router's pathname has the /order basename stripped; useHref puts
  // it back, so the canonical is the address in the bar.
  const href = useHref(pathname);
  const appName = site_name?.trim() || 'Bake & Grill';

  useEffect(() => {
    document.title = title ? `${title} — ${appName}` : appName;
  }, [title, appName]);

  useEffect(() => {
    const url = canonicalUrlFor(window.location.origin, href);
    setLink('canonical', url);
    setMeta('og:url', url);
  }, [href]);
}
