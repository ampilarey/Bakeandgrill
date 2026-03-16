import { createContext, useContext, useEffect, useState } from 'react';

export interface SiteSettings {
  site_name?: string;
  site_tagline?: string;
  logo?: string;
  favicon?: string;
  business_phone?: string;
  business_email?: string;
  business_address?: string;
  business_landmark?: string;
  business_maps_url?: string;
  business_whatsapp?: string;
  business_viber?: string;
  maps_embed_url?: string;
  [key: string]: string | undefined;
}

const DEFAULT_SETTINGS: SiteSettings = {
  site_name:        'Bake & Grill',
  site_tagline:     'Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.',
  logo:             '/logo.png',
  business_phone:   '+960 912 0011',
  business_email:   'hello@bakeandgrill.mv',
  business_address: 'Kalaafaanu Hingun, Malé, Maldives',
  business_landmark:'Near H. Sahara',
  business_maps_url:'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives',
  business_whatsapp:'https://wa.me/9609120011',
  business_viber:   'viber://chat?number=9609120011',
};

const SiteSettingsContext = createContext<SiteSettings>(DEFAULT_SETTINGS);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch('/api/site-settings/public')
      .then((r) => r.json())
      .then(({ settings: s }: { settings: Record<string, string> }) => {
        if (s && typeof s === 'object') {
          setSettings({ ...DEFAULT_SETTINGS, ...s });
        }
      })
      .catch(() => {
        // Gracefully keep defaults if the API is unavailable
      });
  }, []);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext);
}
