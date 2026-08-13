import { useEffect, useState } from 'react';

/**
 * Same band as AppShell and `index.css` `@media (max-width: 767px)`.
 * Do not introduce a second numeric breakpoint.
 */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

/** Content Hub tablet / compact Admin — no permanent three-column layout. */
export const COMPACT_ADMIN_MEDIA_QUERY = '(min-width: 768px) and (max-width: 1199px)';

/** Content Hub wide desktop — rail + editor + optional preview column. */
export const WIDE_DESKTOP_MEDIA_QUERY = '(min-width: 1200px)';

function readMatch(query: string, fallback: () => boolean): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(query).matches;
  }
  return fallback();
}

function useMatchMedia(query: string, fallbackWidthCheck: () => boolean): boolean {
  const [matches, setMatches] = useState(() => readMatch(query, fallbackWidthCheck));

  useEffect(() => {
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia(query);
      const update = () => setMatches(mql.matches);
      update();
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    const onResize = () => setMatches(fallbackWidthCheck());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // fallbackWidthCheck is a stable module-level function in callers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}

function fallbackMobile(): boolean {
  return window.innerWidth <= 767;
}
function fallbackCompact(): boolean {
  return window.innerWidth >= 768 && window.innerWidth <= 1199;
}
function fallbackWide(): boolean {
  return window.innerWidth >= 1200;
}

/** True when the viewport matches the admin mobile breakpoint. */
export function useIsMobile(): boolean {
  return useMatchMedia(MOBILE_MEDIA_QUERY, fallbackMobile);
}

/** True for Content Hub compact Admin (768–1199). */
export function useIsCompactAdmin(): boolean {
  return useMatchMedia(COMPACT_ADMIN_MEDIA_QUERY, fallbackCompact);
}

/** True for Content Hub wide desktop (≥1200). */
export function useIsWideDesktop(): boolean {
  return useMatchMedia(WIDE_DESKTOP_MEDIA_QUERY, fallbackWide);
}
