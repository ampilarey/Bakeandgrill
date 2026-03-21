import { createContext, useContext, useEffect, useMemo, useState } from 'react';

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
  delivery_eta?: string;
  delivery_time?: string;
  /** JSON string from CMS — parsed into `trustItems` */
  trust_items?: string;
  hero_slide_1?: string;
  hero_slide_2?: string;
  hero_slide_3?: string;
  [key: string]: string | undefined;
}

/** Trust strip row — matches Blade `trust_items` JSON */
export interface TrustItemRow {
  icon?: string;
  heading?: string;
  subtext?: string;
}

/** Hero carousel slide — matches Blade `hero_slide_N` JSON */
export interface HeroSlideRow {
  image?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  cta_text?: string;
  cta_url?: string;
  cta2_text?: string;
  cta2_url?: string;
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

/** Same defaults as backend migration `trust_items` seed */
export const DEFAULT_TRUST_ITEMS: TrustItemRow[] = [
  { icon: '🌅', heading: 'Baked fresh at 5am daily', subtext: "Never yesterday's pastry" },
  { icon: '🏠', heading: 'Family-owned', subtext: 'Neighbourhood kitchen, Malé' },
  { icon: '⚡', heading: '30–45 min delivery', subtext: 'Anywhere in Malé' },
  { icon: '💬', heading: 'WhatsApp & Viber', subtext: '+960 9120011' },
];

function parseTrustItems(raw: string | undefined | null): TrustItemRow[] {
  if (raw == null || raw === '') return DEFAULT_TRUST_ITEMS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as TrustItemRow[];
  } catch {
    /* ignore */
  }
  return DEFAULT_TRUST_ITEMS;
}

function parseHeroSlides(rawMap: Record<string, string | undefined>): HeroSlideRow[] {
  const out: HeroSlideRow[] = [];
  for (let i = 1; i <= 3; i++) {
    const raw = rawMap[`hero_slide_${i}`];
    if (!raw) continue;
    try {
      const slide = JSON.parse(raw) as HeroSlideRow;
      if (slide && typeof slide === 'object' && slide.title && String(slide.title).trim() !== '') {
        out.push(slide);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export interface SiteSettingsContextValue {
  settings: SiteSettings;
  trustItems: TrustItemRow[];
  heroSlides: HeroSlideRow[];
}

const defaultContextValue: SiteSettingsContextValue = {
  settings: DEFAULT_SETTINGS,
  trustItems: DEFAULT_TRUST_ITEMS,
  heroSlides: [],
};

const SiteSettingsContext = createContext<SiteSettingsContextValue>(defaultContextValue);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch('/api/site-settings/public')
      .then((r) => r.json())
      .then(({ settings: s }: { settings: Record<string, string | null> }) => {
        if (s && typeof s === 'object') {
          const nonNull = Object.fromEntries(
            Object.entries(s).filter(([, v]) => v != null)
          ) as SiteSettings;
          setSettings({ ...DEFAULT_SETTINGS, ...nonNull });
        }
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.warn('[SiteSettings] Failed to load site settings, using defaults:', e);
      });
  }, []);

  const trustItems = useMemo(() => parseTrustItems(settings.trust_items), [settings.trust_items]);
  const heroSlides = useMemo(
    () => parseHeroSlides(settings as Record<string, string | undefined>),
    [settings.hero_slide_1, settings.hero_slide_2, settings.hero_slide_3]
  );

  const value = useMemo(
    () => ({ settings, trustItems, heroSlides }),
    [settings, trustItems, heroSlides]
  );

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext).settings;
}

export function useSiteSettingsContext(): SiteSettingsContextValue {
  return useContext(SiteSettingsContext);
}
