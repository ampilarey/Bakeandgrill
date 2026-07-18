import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AnalyticsTracker } from '../components/AnalyticsTracker';

const SITE_SETTINGS_URL =
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api')) +
  '/site-settings/public';

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
  trust_items?: string;
  hero_slide_1?: string;
  hero_slide_2?: string;
  hero_slide_3?: string;
  homepage_categories?: string;
  proof_stat?: string;
  proof_label?: string;
  proof_details?: string;
  cta_band_headline?: string;
  cta_band_subtext?: string;
  home_categories_eyebrow?: string;
  home_categories_title?: string;
  home_categories_subtitle?: string;
  home_featured_eyebrow_bestseller?: string;
  home_featured_eyebrow_handpicked?: string;
  home_featured_title_bestseller?: string;
  home_featured_title_handpicked?: string;
  home_featured_subtitle?: string;
  home_proof_eyebrow?: string;
  home_specials_eyebrow?: string;
  home_specials_title?: string;
  home_hero_fallback_title?: string;
  home_hero_fallback_subtitle?: string;
  contact_page_title?: string;
  contact_page_subtitle?: string;
  hours_page_title?: string;
  hours_page_note?: string;
  privacy_page_title?: string;
  preorder_confirm_title?: string;
  preorder_confirm_message?: string;
  preorder_confirm_steps?: string;
  preorder_submit_label?: string;
  about_page_title?: string;
  about_page_story?: string;
  about_values?: string;
  legal_privacy_body?: string;
  order_checkout_title?: string;
  order_checkout_subtitle?: string;
  order_payment_compliance?: string;
  order_auth_privacy_line?: string;
  order_home_reviews_title?: string;
  order_mode_delivery_hint?: string;
  order_mode_pickup_hint?: string;
  primary_color?: string;
  delivery_threshold?: string;
  preorder_page_title?: string;
  preorder_page_subtitle?: string;
  footer_text?: string;
  footer_links?: string;
  footer_quick_links_heading?: string;
  footer_location_heading?: string;
  footer_contact_heading?: string;
  footer_rights_suffix?: string;
  nav_order_cta_text?: string;
  announcement_enabled?: string;
  announcement_text?: string;
  announcement_url?: string;
  announcement_style?: string;
  office_orders_enabled?: string;
  office_orders_headline?: string;
  office_orders_subtext?: string;
  office_orders_min_guests?: string;
  [key: string]: string | undefined;
}

export interface TrustItemRow {
  icon?: string;
  heading?: string;
  subtext?: string;
}

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

export interface HomepageCategoryRow {
  icon?: string;
  label?: string;
  name?: string;
  hook?: string;
  image_url?: string;
  link?: string;
}

export interface ProofDetailRow {
  value?: string;
  label?: string;
}

export interface AboutValueRow {
  initial?: string;
  title?: string;
  description?: string;
}

export interface FooterLinkRow {
  label?: string;
  url?: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  site_name:        'Bake & Grill',
  site_tagline:     'Authentic Dhivehi cuisine, artisan pastries, and expertly grilled specialties — freshly made every day in the heart of Malé.',
  logo:             '/logo.png',
  business_phone:   '+960 912 0011',
  business_email:   'admin@bakeandgrill.mv',
  business_address: 'Kalaafaanu Hingun, Malé, Maldives',
  business_landmark:'Near H. Sahara',
  business_maps_url:'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives',
  business_whatsapp:'https://wa.me/9609120011',
  business_viber:   'viber://chat?number=9609120011',
};

export const DEFAULT_TRUST_ITEMS: TrustItemRow[] = [
  { icon: '🌅', heading: 'Baked fresh at 5am daily', subtext: "Never yesterday's pastry" },
  { icon: '🏠', heading: 'Family-owned', subtext: 'Neighbourhood kitchen, Malé' },
  { icon: '⚡', heading: '30–45 min delivery', subtext: 'Anywhere in Malé' },
  { icon: '💬', heading: 'WhatsApp & Viber', subtext: '+960 9120011' },
];

const DEFAULT_CATEGORIES: HomepageCategoryRow[] = [
  { icon: '🥐', label: 'Hedhikaa', name: 'Dhivehi Breakfast', hook: 'The breakfast your grandmother made, ready by 7am.', link: '/menu' },
  { icon: '🥐', label: 'Pastries & Bakes', name: 'Fresh Bakes', hook: 'Croissants that crackle. Cream buns that melt. Baked at dawn.', link: '/menu' },
  { icon: '🔥', label: 'Grills', name: 'Char & Grill', hook: 'Proper char. Proper flavor. Made to order, never pre-cooked.', link: '/menu' },
  { icon: '🎂', label: 'Cakes & Special Orders', name: 'Celebration Cakes', hook: 'Celebration-worthy. Made to order. Call ahead to reserve yours.', link: '/menu' },
];

function parseJsonArray<T>(raw: string | undefined | null, fallback: T[]): T[] {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as T[];
  } catch {
    /* ignore */
  }
  return fallback;
}

function parseTrustItems(raw: string | undefined | null): TrustItemRow[] {
  return parseJsonArray(raw, DEFAULT_TRUST_ITEMS);
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

function parseHomepageCategories(raw: string | undefined | null): HomepageCategoryRow[] {
  return parseJsonArray(raw, DEFAULT_CATEGORIES);
}

function parseProofDetails(raw: string | undefined | null): ProofDetailRow[] {
  return parseJsonArray(raw, [
    { value: '5am', label: 'Baking starts' },
    { value: '30–45 min', label: 'Average delivery' },
    { value: 'MVR 200', label: 'Free delivery above' },
  ]);
}

function parseAboutValues(raw: string | undefined | null): AboutValueRow[] {
  return parseJsonArray(raw, [
    { initial: 'F', title: 'Fresh Ingredients', description: 'We source locally and prep daily. No shortcuts, no compromises.' },
    { initial: 'C', title: 'Community First', description: 'We are part of Malé — we know our customers and they know us.' },
    { initial: 'Q', title: 'Quality Always', description: "Whether it's a cup of tea or a full grill, everything gets the same care." },
    { initial: 'B', title: 'Built for Today', description: 'Online ordering, table reservations, loyalty rewards — all in one place.' },
  ]);
}

function parseFooterLinks(raw: string | undefined | null): FooterLinkRow[] {
  return parseJsonArray(raw, [
    { label: 'Privacy Policy', url: '/privacy' },
    { label: 'Terms', url: '/terms' },
  ]);
}

export interface SiteSettingsContextValue {
  settings: SiteSettings;
  trustItems: TrustItemRow[];
  heroSlides: HeroSlideRow[];
  homepageCategories: HomepageCategoryRow[];
  proofDetails: ProofDetailRow[];
  aboutValues: AboutValueRow[];
  footerLinks: FooterLinkRow[];
  /** Read a setting with fallback when empty. */
  text: (key: keyof SiteSettings | string, fallback: string) => string;
}

const defaultContextValue: SiteSettingsContextValue = {
  settings: DEFAULT_SETTINGS,
  trustItems: DEFAULT_TRUST_ITEMS,
  heroSlides: [],
  homepageCategories: DEFAULT_CATEGORIES,
  proofDetails: [],
  aboutValues: [],
  footerLinks: [],
  text: (_k, fallback) => fallback,
};

const SiteSettingsContext = createContext<SiteSettingsContextValue>(defaultContextValue);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch(SITE_SETTINGS_URL)
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

  // Optional brand accent from CMS (valid hex only).
  useEffect(() => {
    const raw = (settings.primary_color ?? '').trim();
    const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : '';
    if (!hex) return;
    const root = document.documentElement;
    const prev = root.style.getPropertyValue('--color-primary');
    root.style.setProperty('--color-primary', hex);
    return () => {
      if (prev) root.style.setProperty('--color-primary', prev);
      else root.style.removeProperty('--color-primary');
    };
  }, [settings.primary_color]);

  const text = useCallback(
    (key: keyof SiteSettings | string, fallback: string) => {
      const v = settings[key as keyof SiteSettings];
      if (v == null || String(v).trim() === '') return fallback;
      return String(v);
    },
    [settings],
  );

  const trustItems = useMemo(() => parseTrustItems(settings.trust_items), [settings.trust_items]);
  const heroSlides = useMemo(
    () => parseHeroSlides(settings as Record<string, string | undefined>),
    [settings.hero_slide_1, settings.hero_slide_2, settings.hero_slide_3],
  );
  const homepageCategories = useMemo(
    () => parseHomepageCategories(settings.homepage_categories),
    [settings.homepage_categories],
  );
  const proofDetails = useMemo(() => parseProofDetails(settings.proof_details), [settings.proof_details]);
  const aboutValues = useMemo(() => parseAboutValues(settings.about_values), [settings.about_values]);
  const footerLinks = useMemo(() => parseFooterLinks(settings.footer_links), [settings.footer_links]);

  const value = useMemo(
    () => ({
      settings,
      trustItems,
      heroSlides,
      homepageCategories,
      proofDetails,
      aboutValues,
      footerLinks,
      text,
    }),
    [settings, trustItems, heroSlides, homepageCategories, proofDetails, aboutValues, footerLinks, text],
  );

  return (
    <SiteSettingsContext.Provider value={value}>
      <AnalyticsTracker settings={settings} />
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

/** Interpolate {address} and similar placeholders in CMS copy. */
export function interpolateCopy(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}
