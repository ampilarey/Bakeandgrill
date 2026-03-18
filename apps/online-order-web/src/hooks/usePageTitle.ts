import { useEffect } from 'react';

const APP_NAME = 'Bake & Grill';

/**
 * Sets the document title to `${title} — Bake & Grill`.
 * Pass null to use just the base app name.
 */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
  }, [title]);
}
