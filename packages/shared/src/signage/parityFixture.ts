import type { MenuItemLite, SignageConfig, SignageSlide, SignageTheme } from './types';

/** Canonical sample used by parity tests in order + admin apps. */
export const PARITY_THEME: SignageTheme = {
  primary: '#D4813A',
  background: '#1C1408',
  surface: '#2A2118',
  text: '#FFF8F0',
  muted: '#C4B5A5',
  font_display: 'Georgia, serif',
  font_body: 'system-ui, sans-serif',
};

export const PARITY_VARIABLES: Record<string, string> = {
  branch_name: 'Bake & Grill',
  current_time: '1:00 PM',
  today: 'Today',
  next_prayer: '',
  wifi_name: 'BG-Guest',
  wifi_password: '',
  promotion_name: '',
};

export const PARITY_ITEMS: MenuItemLite[] = [
  { id: 11, name: 'Chicken Wrap', base_price: 45, sales_30d: 120, category_id: 1 },
  { id: 12, name: 'Beef Burger', base_price: 55, sales_30d: 90, category_id: 1 },
];

export const PARITY_SLIDE: SignageSlide = {
  id: 'parity-slide',
  name: 'Parity',
  seconds: 12,
  weight: 1,
  transition: 'fade',
  transition_ms: 200,
  background: { type: 'solid', value: '#1C1408', opacity: 1 },
  elements: [
    {
      id: 't1',
      type: 'text',
      x: 10,
      y: 20,
      w: 80,
      h: 15,
      z: 2,
      text: 'Hello {{branch_name}}',
      style: { fontSize: 4, color: '#FFF8F0', fontWeight: 800 },
      animation: { entrance: 'fade', duration: 500 },
      binding: {},
    },
    {
      id: 'm1',
      type: 'menu_list',
      x: 10,
      y: 40,
      w: 80,
      h: 50,
      z: 1,
      binding: { type: 'smart', smart_type: 'bestsellers', limit: 6 },
      style: { columns: 1 },
      animation: { entrance: 'rise' },
    },
  ],
};

export function parityConfig(orientation: string = 'landscape'): SignageConfig {
  return {
    screen: { id: 1, name: 'Main', slug: 'default', group_id: 1 },
    playlist_id: 1,
    playlist_version: 'parity',
    source: 'playlist',
    mode: 'normal',
    orientation,
    resolution: '1920x1080',
    refresh_seconds: 120,
    theme: PARITY_THEME,
    slides: [PARITY_SLIDE],
    rotation: [PARITY_SLIDE.id],
    variables: PARITY_VARIABLES,
    bestsellers: PARITY_ITEMS.map((i) => ({
      id: i.id,
      name: i.name,
      base_price: i.base_price,
      sales_30d: i.sales_30d,
    })),
    menu_new_days: 30,
  };
}

/** DOM markers both apps must produce for the shared renderer. */
export const PARITY_MARKERS = [
  'signage-slide-canvas',
  'signage-el-text',
  'signage-el-menu_list',
] as const;
