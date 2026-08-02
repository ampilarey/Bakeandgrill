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

export type SignageBannerSettings = {
  enabled: boolean;
  position: 'top' | 'bottom' | string;
  fields: Array<'date' | 'time' | 'next_prayer' | 'countdown' | string>;
  speed_seconds: number;
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
