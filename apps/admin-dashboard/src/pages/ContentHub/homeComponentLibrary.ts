/**
 * Home Component Library — admin mirror of BlockTypeRegistry.
 * Every type can be added to Website and Order App independently.
 */

export type HomeApp = 'website' | 'order_app';

export type LibraryComponent = {
  type: string;
  name: string;
  summary: string;
  supportsSharedContent: boolean;
  allowsMultiple?: boolean;
  flowWarning?: string;
  dynamicSource?: string;
  deprecated?: boolean;
};

/** Canonical library (non-deprecated). */
export const HOME_COMPONENT_LIBRARY: LibraryComponent[] = [
  { type: 'greeting', name: 'Greeting / welcome', summary: 'Welcome line at the top of Home.', supportsSharedContent: false },
  {
    type: 'prayer_bar',
    name: 'Prayer Time Banner',
    summary: 'Current/next prayer, countdown, dates, island choice, and timetable.',
    supportsSharedContent: false,
    dynamicSource: 'Prayer times service',
  },
  {
    type: 'hero',
    name: 'Hero banner / promotional carousel',
    summary: 'Photo/video slideshow from Hero banners (hero_slides).',
    supportsSharedContent: false,
    dynamicSource: 'hero_slides',
  },
  {
    type: 'announcement',
    name: 'Announcement banner',
    summary: 'Short notice — place in header or on Home.',
    supportsSharedContent: false,
    dynamicSource: 'announcement_* content',
  },
  {
    type: 'service_availability',
    name: 'Service availability / maintenance',
    summary: 'Shows when ordering or related services are paused.',
    supportsSharedContent: false,
    dynamicSource: 'Service availability API',
  },
  {
    type: 'opening_status',
    name: 'Opening status',
    summary: 'Open/closed badge. Follows its own placement — never forced into Hero.',
    supportsSharedContent: false,
    dynamicSource: 'Online ordering status',
  },
  {
    type: 'stat_chips',
    name: 'Stat chips / loyalty summary',
    summary: 'Loyalty and quick stats — only where you place them.',
    supportsSharedContent: false,
    dynamicSource: 'Loyalty account API',
  },
  {
    type: 'mode_cards',
    name: 'Order mode cards',
    summary: 'Delivery, Pickup, and Dine-in entry cards.',
    supportsSharedContent: false,
    flowWarning: 'Without these cards, customers need another path into ordering.',
  },
  {
    type: 'specials',
    name: 'Specials / offers carousel',
    summary: 'Today’s specials and offers.',
    supportsSharedContent: false,
    dynamicSource: 'Offers API',
  },
  {
    type: 'featured',
    name: 'Featured items',
    summary: 'Highlighted menu items.',
    supportsSharedContent: false,
    dynamicSource: 'Menu items',
  },
  {
    type: 'categories',
    name: 'Categories',
    summary: 'Shortcut tiles into menu categories.',
    supportsSharedContent: false,
  },
  {
    type: 'trust_strip',
    name: 'Trust strip',
    summary: 'Four trust signals — never auto-injected.',
    supportsSharedContent: false,
    dynamicSource: 'trust_items',
  },
  { type: 'proof', name: 'Social proof', summary: 'Stats and trust numbers.', supportsSharedContent: false },
  {
    type: 'reviews',
    name: 'Customer reviews',
    summary: 'Recent star ratings and comments.',
    supportsSharedContent: false,
    dynamicSource: 'Featured reviews API',
  },
  {
    type: 'reorder_strip',
    name: 'Reorder strip',
    summary: 'One-tap reorder for returning customers.',
    supportsSharedContent: false,
    dynamicSource: 'Customer orders API',
  },
  { type: 'cta', name: 'Call-to-action band', summary: 'Hungry? style order banner.', supportsSharedContent: false },
  { type: 'location', name: 'Location / map', summary: 'Address, map, and directions.', supportsSharedContent: false },
  {
    type: 'events_band',
    name: 'Catering / events band',
    summary: 'Events & catering call-to-action.',
    supportsSharedContent: false,
  },
  {
    type: 'office_orders',
    name: 'Office orders card',
    summary: 'Corporate / office catering card.',
    supportsSharedContent: false,
    dynamicSource: 'office_orders_* content',
  },
  {
    type: 'brand_footer',
    name: 'Brand footer / Home footer',
    summary: 'Compact Home footer with chat links and thanks line.',
    supportsSharedContent: false,
    flowWarning: 'Hiding this removes Home contact shortcuts. Full footer surface is separate.',
  },
  {
    type: 'site_footer',
    name: 'Full footer',
    summary: 'Full branding/contact/legal footer — not the same as bottom navigation.',
    supportsSharedContent: false,
    dynamicSource: 'Footer content keys + opening-hours service',
  },
  {
    type: 'bottom_nav',
    name: 'Bottom navigation',
    summary: 'Mobile tab bar (Home, Menu, Orders, …). Separate from Footer.',
    supportsSharedContent: false,
  },
  { type: 'rich_text', name: 'Custom text', summary: 'Heading and paragraph.', supportsSharedContent: false, allowsMultiple: true },
  { type: 'image', name: 'Custom image', summary: 'One picture with optional caption.', supportsSharedContent: false, allowsMultiple: true },
  { type: 'image_text', name: 'Image with text', summary: 'Picture beside heading and paragraph.', supportsSharedContent: false, allowsMultiple: true },
  { type: 'video', name: 'Video', summary: 'Silent looping video.', supportsSharedContent: false, allowsMultiple: true },
  { type: 'button_band', name: 'Button band', summary: 'Text with up to two buttons.', supportsSharedContent: false, allowsMultiple: true },
  { type: 'faq_list', name: 'FAQ', summary: 'Questions and answers.', supportsSharedContent: false, allowsMultiple: true },
  { type: 'divider', name: 'Divider / spacing', summary: 'Space or a thin rule between sections.', supportsSharedContent: false, allowsMultiple: true },
];

export type AppInstanceStatus = 'Added' | 'Hidden' | 'Not added';

export function instanceStatus(block: { is_enabled: boolean } | undefined): AppInstanceStatus {
  if (!block) return 'Not added';
  return block.is_enabled ? 'Added' : 'Hidden';
}

function placementSlotLabel(slot: string): string {
  switch (slot) {
    case 'header':
      return 'header';
    case 'footer':
      return 'footer';
    case 'bottom_navigation':
      return 'bottom nav';
    case 'home':
    default:
      return 'home';
  }
}

function readPlacement(settings: Record<string, unknown> | undefined, key: string): string {
  const v = settings?.[key];
  if (v === 'header' || v === 'home' || v === 'footer' || v === 'bottom_navigation') return v;
  return 'home';
}

export function placementLabels(settings: Record<string, unknown> | undefined): string[] {
  const showDesk = settings?.show_desktop !== false;
  const showMob = settings?.show_mobile !== false;
  const placeDesk = placementSlotLabel(readPlacement(settings, 'placement_desktop'));
  const placeMob = placementSlotLabel(readPlacement(settings, 'placement_mobile'));
  const out: string[] = [];
  if (showDesk) out.push(`Desktop · ${placeDesk}`);
  else out.push('Desktop · off');
  if (showMob) out.push(`Mobile · ${placeMob}`);
  else out.push('Mobile · off');
  return out;
}
