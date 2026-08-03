export type SignageElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  z?: number;
  style?: Record<string, unknown>;
  animation?: {
    entrance?: string;
    emphasis?: string;
    duration?: number;
    delay?: number;
    easing?: string;
  };
  binding?: Record<string, unknown>;
  text?: string;
  locked?: boolean;
  hidden?: boolean;
};

export type SignageSlide = {
  id: string;
  name?: string;
  seconds?: number;
  weight?: number;
  transition?: string;
  transition_ms?: number;
  background?: { type?: string; value?: string; opacity?: number };
  template_origin?: string;
  smart_type?: string;
  elements?: SignageElement[];
};

export type SignageTheme = {
  primary?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  font_display?: string;
  font_body?: string;
  [key: string]: string | undefined;
};

export type SignagePrayerEntry = {
  name: string;
  /** Absolute ISO 8601 timestamp with timezone offset. */
  at: string;
};

export type SignageBannerDateFormat = 'full' | 'short' | 'numeric' | 'weekday' | 'hijri';
export type SignageBannerAlign = 'left' | 'center' | 'right';

export type SignageBannerItem = {
  id: string;
  label: string;
  enabled: boolean;
  position: 'top' | 'bottom' | string;
  fields: Array<'date' | 'time' | 'next_prayer' | 'countdown' | string>;
  /** When set, replaces the fields marquee (supports {{variables}}). */
  custom_text?: string;
  speed_seconds: number;
  /** How long this banner stays before rotating to the next enabled one. */
  duration_seconds: number;
  /** Multiplier on the 2.2vmin base font size. */
  font_scale: number;
  /** Multiplier on the 5.2vmin base height. */
  height_scale: number;
  text_color: string;
  /** May include alpha, e.g. rgba(12, 8, 4, 0.78). */
  background_color: string;
  /** Meaningful when scroll is false. */
  align: SignageBannerAlign | string;
  /** When false, renders a static bar (no marquee). */
  scroll: boolean;
  date_format: SignageBannerDateFormat | string;
  /** 0–5 — percent inset from the screen edge (TV overscan). */
  inset_percent: number;
};

export type SignageBannerSettings = {
  enabled: boolean;
  banners: SignageBannerItem[];
  /** @deprecated Stage-3 single-banner fields — still accepted on read. */
  position?: 'top' | 'bottom' | string;
  fields?: Array<'date' | 'time' | 'next_prayer' | 'countdown' | string>;
  speed_seconds?: number;
};

export type SignageConfig = {
  screen: { id: number; name: string; slug: string; group_id: number | null } | null;
  playlist_id: number | null;
  playlist_version: string;
  source: string;
  mode: string;
  orientation: string;
  resolution: string;
  refresh_seconds: number;
  theme: SignageTheme;
  slides: SignageSlide[];
  rotation: string[];
  variables: Record<string, string>;
  prayer_schedule?: SignagePrayerEntry[];
  banner?: SignageBannerSettings;
  bestsellers: Array<{
    id: number;
    name: string;
    base_price: number;
    image_url?: string | null;
    short_description?: string | null;
    sales_30d?: number;
  }>;
  menu_new_days: number;
  server_time?: string;
};

export type MenuItemLite = {
  id: number;
  name: string;
  base_price: number;
  category_id?: number | null;
  image_url?: string | null;
  thumb_url?: string | null;
  short_description?: string | null;
  created_at?: string | null;
  sales_30d?: number;
  is_combo?: boolean;
  special?: { effective_price?: number; original_price?: number; discount_pct?: number | null } | null;
  /** Hard exclude from the TV board. Undefined is treated as visible. */
  show_on_signage?: boolean;
  /** Force a showcase slide even with no photo and no discount. */
  is_signage_promoted?: boolean;
};

export type SignageCategoryLite = {
  id: number;
  name: string;
};
