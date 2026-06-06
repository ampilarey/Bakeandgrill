import { useEffect } from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

/**
 * Sets the document title to `${title} — {site_name}`.
 * Pass null to use just the site name.
 */
export function usePageTitle(title: string | null) {
  const { site_name } = useSiteSettings();
  const appName = site_name?.trim() || 'Bake & Grill';

  useEffect(() => {
    document.title = title ? `${title} — ${appName}` : appName;
  }, [title, appName]);
}
