import { useEffect, useState } from 'react';

/**
 * Same band as AppShell and `index.css` `@media (max-width: 767px)`.
 * Do not introduce a second numeric breakpoint.
 */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

function readMobile(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  }
  return window.innerWidth <= 767;
}

/** True when the viewport matches the admin mobile breakpoint. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(readMobile);

  useEffect(() => {
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
      const update = () => setIsMobile(mql.matches);
      update();
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    const onResize = () => setIsMobile(window.innerWidth <= 767);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isMobile;
}
