import { useEffect } from 'react';
import type { SiteSettings } from '../context/SiteSettingsContext';

/** Inject GA4 or GTM once public site settings include tracking IDs. */
export function AnalyticsTracker({ settings }: { settings: SiteSettings }) {
  useEffect(() => {
    const gtmId = settings.google_tag_manager_id?.trim();
    const gaId = settings.google_analytics_id?.trim();

    if (gtmId) {
      if (document.getElementById('bg-gtm-script')) return;
      const script = document.createElement('script');
      script.id = 'bg-gtm-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
      document.head.appendChild(script);
      window.dataLayer = window.dataLayer ?? [];
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      return;
    }

    if (!gaId || !gaId.startsWith('G-')) return;
    if (document.getElementById('bg-ga-script')) return;

    const script = document.createElement('script');
    script.id = 'bg-ga-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(script);

    const inline = document.createElement('script');
    inline.id = 'bg-ga-inline';
    inline.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${gaId.replace(/'/g, '')}');
    `;
    document.head.appendChild(inline);
  }, [settings.google_analytics_id, settings.google_tag_manager_id]);

  return null;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}
