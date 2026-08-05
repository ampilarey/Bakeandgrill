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
/** ticker = one copy clears the screen; seamless = duplicated loop; static = no motion. */
export type SignageBannerScrollMode = 'ticker' | 'seamless' | 'static';
export type SignageBannerDirection = 'ltr' | 'rtl';

/** Same shape as campaign windows — reused for banners and scheduled emergencies. */
export type SignageSchedule = {
  date_start?: string | null;
  date_end?: string | null;
  /** 0=Sun … 6=Sat. Empty/null = every day. */
  days?: number[] | null;
  windows?: Array<{ start: string; end: string }> | null;
};

export type SignageBannerItem = {
  id: string;
  label: string;
  enabled: boolean;
  position: 'top' | 'bottom' | string;
  fields: Array<'date' | 'time' | 'next_prayer' | 'countdown' | 'all_prayers' | string>;
  /** When set, replaces the fields marquee (supports {{variables}}). */
  custom_text?: string;
  /**
   * Compatibility knob for travel rate. Presets map to outcome labels
   * (Very slow → Very fast). Ticker/seamless animation duration is derived
   * from measured track width so short and long messages share visual speed.
   */
  speed_seconds: number;
  /**
   * @deprecated Ignored for rotation. Kept so old saves load cleanly.
   * Advancement uses `repeat_count` + animation events.
   */
  duration_seconds: number;
  /** How many full passes before the next banner (default 1). */
  repeat_count: number;
  /** Multiplier on the 2.2vmin base font size. */
  font_scale: number;
  /** Multiplier on the 5.2vmin base height. */
  height_scale: number;
  text_color: string;
  /** May include alpha, e.g. rgba(12, 8, 4, 0.78). */
  background_color: string;
  /** Meaningful when scroll_mode is static. */
  align: SignageBannerAlign | string;
  scroll_mode: SignageBannerScrollMode | string;
  /** ltr = English ticker; rtl = Dhivehi (dir=rtl, lang=dv). */
  direction: SignageBannerDirection | string;
  date_format: SignageBannerDateFormat | string;
  /** 0–5 — percent inset from the screen edge (TV overscan). */
  inset_percent: number;
  /** Absent / empty = always on. */
  schedule?: SignageSchedule | null;
};

export type SignageBannerSettings = {
  enabled: boolean;
  banners: SignageBannerItem[];
  /** Show brand logo in the strip between banners (skipped when only one enabled). */
  show_logo_between?: boolean;
  /** @deprecated Stage-3 single-banner fields — still accepted on read. */
  position?: 'top' | 'bottom' | string;
  fields?: Array<'date' | 'time' | 'next_prayer' | 'countdown' | 'all_prayers' | string>;
  speed_seconds?: number;
};

export type SignageEmergencyLayout = 'notice' | 'alert' | 'split' | 'countdown' | 'full_bleed';
export type SignageEmergencyMediaType = 'none' | 'image' | 'video' | 'icon';

export type SignageEmergencyEntry = {
  id: string;
  mode: string;
  priority: number;
  is_active: boolean;
  layout: SignageEmergencyLayout | string;
  title: string;
  body: string;
  title_dv?: string;
  body_dv?: string;
  /** For reopening_soon countdown. */
  reopen_at?: string | null;
  schedule?: SignageSchedule | null;
  media_type?: SignageEmergencyMediaType | string;
  /** Library URL from MediaPicker — never typed freehand. */
  media_url?: string;
  /** Named pictogram when media_type is icon. */
  icon?: string;
};

export type SignageEmergencySettings = {
  /** Immediate manual override — beats every scheduled entry. */
  manual: string;
  entries: SignageEmergencyEntry[];
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
  image_webp_url?: string | null;
  thumb_webp_url?: string | null;
  short_description?: string | null;
  created_at?: string | null;
  sales_30d?: number;
  is_combo?: boolean;
  special?: { effective_price?: number; original_price?: number; discount_pct?: number | null } | null;
  /** Hard exclude from the TV board. Undefined is treated as visible. */
  show_on_signage?: boolean;
  /** Force a showcase slide even with no photo and no discount. */
  is_signage_promoted?: boolean;
  /** From public menu — used to keep sold-out dishes off showcase slides. */
  available_now?: boolean;
  unavailable_reason?: string | null;
  availability?: {
    available?: boolean;
    reason_code?: string | null;
    available_stock?: number | null;
  } | null;
};

export type SignageCategoryLite = {
  id: number;
  name: string;
};
