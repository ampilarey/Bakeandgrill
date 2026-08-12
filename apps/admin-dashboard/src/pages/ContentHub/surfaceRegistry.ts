/**
 * Customer Surface Map — single source of truth for Content & Branding admin.
 * Labels, placements, and allowed actions must match Website / Order App renderers.
 */

export type SurfacePlacement =
  | 'Website header'
  | 'Website home'
  | 'Website footer'
  | 'Website contact'
  | 'Website hours'
  | 'Website legal'
  | 'Order App desktop header'
  | 'Order App phone home'
  | 'Order App desktop home'
  | 'Order App footer'
  | 'Order App menu'
  | 'Order App checkout'
  | 'Order App about'
  | 'Order App contact'
  | 'Order App hours'
  | 'Order App privacy'
  | 'Order App status banners'
  | 'Both products (shared)';

export type SurfaceKind =
  | 'reorderable_block'
  | 'fixed_editable'
  | 'system_managed'
  | 'managed_elsewhere'
  | 'injected_module';

export type SurfaceAction = 'edit' | 'hide' | 'reorder' | 'remove' | 'preview';

export type ContentSurface = {
  id: string;
  name: string;
  summary: string;
  placements: SurfacePlacement[];
  kind: SurfaceKind;
  /** Website / Order App / both */
  apps: Array<'website' | 'order_app'>;
  actions: SurfaceAction[];
  /** Content Hub ?group= or special route */
  group?: string;
  homeAppHint?: 'website' | 'order_app';
  /** When kind is managed_elsewhere */
  managedBy?: { label: string; href: string };
  note?: string;
  /** page_blocks type when applicable */
  blockType?: string;
  statusHint?: 'Showing' | 'Hidden' | 'Fixed' | 'Shared' | 'Managed elsewhere' | 'Injected';
};

/** Fixed chrome that is NOT a reorderable page_block on Website home. */
export const WEBSITE_HOME_FIXED_MODULES: ContentSurface[] = [
  {
    id: 'website_prayer_header',
    name: 'Prayer times',
    summary: 'Next prayer time in the Website header (desktop and phone).',
    placements: ['Website header'],
    kind: 'system_managed',
    apps: ['website'],
    actions: ['preview'],
    statusHint: 'Fixed',
    note: 'Always shown with the Website header. Not a Home layout block. Prayer data comes from Prayer Times.',
    managedBy: { label: 'Prayer Times', href: '/prayer-times' },
  },
  {
    id: 'website_trust_strip',
    name: 'Trust strip',
    summary: 'Four trust signals under the hero (or in its place if hero is off).',
    placements: ['Website home'],
    kind: 'fixed_editable',
    apps: ['website'],
    actions: ['edit', 'preview'],
    group: 'Homepage',
    homeAppHint: 'website',
    statusHint: 'Fixed',
    note: 'Rendered in a fixed position — not reorderable or removable from Home layout.',
  },
  {
    id: 'website_events_band',
    name: 'Catering & events band',
    summary: 'Hardcoded band after Home sections — copy from Catering & events.',
    placements: ['Website home'],
    kind: 'fixed_editable',
    apps: ['website'],
    actions: ['edit', 'preview'],
    group: 'Catering & events',
    statusHint: 'Fixed',
    note: 'Not a movable Home layout block. Appears after your Home sections on the Website.',
  },
  {
    id: 'website_site_footer',
    name: 'Website footer',
    summary: 'Site-wide footer from layout — contact, links, legal.',
    placements: ['Website footer'],
    kind: 'fixed_editable',
    apps: ['website'],
    actions: ['edit', 'preview'],
    group: 'Footer',
    statusHint: 'Fixed',
    note: 'The Website home “Brand footer” layout row is ignored by the Website renderer. Edit Footer instead.',
  },
];

/** Injected / header-owned modules on Order App home (not free-form blocks). */
export const ORDER_HOME_FIXED_MODULES: ContentSurface[] = [
  {
    id: 'order_prayer_desktop',
    name: 'Prayer times (desktop header)',
    summary: 'Always shown in the Order App desktop top navigation.',
    placements: ['Order App desktop header'],
    kind: 'system_managed',
    apps: ['order_app'],
    actions: ['preview'],
    statusHint: 'Fixed',
    note: 'Turning off the phone Home “Prayer times bar” does not remove desktop header prayer.',
    managedBy: { label: 'Prayer Times', href: '/prayer-times' },
  },
  {
    id: 'order_prayer_phone',
    name: 'Prayer times (phone home)',
    summary: 'Optional bar on the Order App phone home layout.',
    placements: ['Order App phone home'],
    kind: 'reorderable_block',
    apps: ['order_app'],
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
    group: 'Homepage',
    homeAppHint: 'order_app',
    blockType: 'prayer_bar',
    statusHint: 'Showing',
    note: 'Phone home only. Desktop prayer is header-owned (see above).',
  },
  {
    id: 'order_stat_chips',
    name: 'Stat chips',
    summary: 'Loyalty / quick stats injected around the hero.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'injected_module',
    apps: ['order_app'],
    actions: ['preview'],
    statusHint: 'Injected',
    note: 'Automatically placed with the hero — not a separate layout block you can reorder.',
  },
  {
    id: 'order_trust_strip',
    name: 'Trust strip',
    summary: 'Injected after order mode cards.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'injected_module',
    apps: ['order_app'],
    actions: ['edit', 'preview'],
    group: 'Homepage',
    homeAppHint: 'order_app',
    statusHint: 'Injected',
    note: 'Not a page_block. Appears after Delivery / Pickup / Dine-in cards.',
  },
  {
    id: 'order_office_band',
    name: 'Office / catering card',
    summary: 'Injected corporate catering card near the bottom of Home.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'injected_module',
    apps: ['order_app'],
    actions: ['edit', 'preview'],
    group: 'Order App',
    statusHint: 'Injected',
    note: 'Uses office_orders_* content — not a reorderable Home block.',
  },
  {
    id: 'order_opening_in_hero',
    name: 'Opening status in hero',
    summary: 'When a hero/promo is on, open/closed status embeds inside it.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'fixed_editable',
    apps: ['order_app'],
    actions: ['edit', 'hide', 'preview'],
    blockType: 'opening_status',
    group: 'Homepage',
    homeAppHint: 'order_app',
    statusHint: 'Fixed',
    note: 'Standalone reorder only applies when Hero / Promo is off. Otherwise it sits inside the hero.',
  },
];

/** page_block type → truthful admin metadata. */
export const BLOCK_SURFACE_META: Record<string, Partial<ContentSurface> & { apps?: Array<'website' | 'order_app'> }> = {
  hero: {
    name: 'Hero banner',
    summary: 'Slideshow from Hero banners (hero_slides).',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
    note: 'Shares the same slides as Promo carousel. Only one of Hero or Promo should be enabled.',
  },
  promo_carousel: {
    name: 'Promo carousel',
    summary: 'Same slides as Hero (hero_slides) — Order App only.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
    note: 'Uses the same hero_slides data as Hero. Prefer keeping only Hero, or only Promo — not both.',
  },
  brand_footer: {
    name: 'Brand footer',
    summary: 'Order App home footer links and thanks line.',
    placements: ['Order App footer'],
    kind: 'fixed_editable',
    actions: ['edit', 'hide', 'preview'],
    note: 'On Website this layout row is ignored — Website footer is site-wide layout. Edit Footer for Website.',
  },
  prayer_bar: {
    name: 'Prayer times bar',
    summary: 'Phone Order App home only.',
    placements: ['Order App phone home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
    note: 'Does not control Website header or Order App desktop header prayer.',
  },
  mode_cards: {
    name: 'Order mode cards',
    summary: 'Delivery, Pickup, Dine-in — required to start an order.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'fixed_editable',
    actions: ['hide', 'preview'],
    note: 'Cannot be removed — required for checkout.',
  },
  opening_status: {
    name: 'Opening status',
    summary: 'Open/closed badge for ordering availability.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
    note: 'When Hero/Promo is on, this embeds inside the hero instead of sitting as a free block.',
  },
  featured: {
    name: 'Featured items',
    summary: 'Website home only.',
    placements: ['Website home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  proof: {
    name: 'Social proof',
    summary: 'Website home only.',
    placements: ['Website home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  cta: {
    name: 'Call-to-action band',
    summary: 'Website home only.',
    placements: ['Website home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  location: {
    name: 'Location',
    summary: 'Website home visit / delivery cards.',
    placements: ['Website home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  reviews: {
    name: 'Customer reviews',
    summary: 'Order App home only.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  reorder_strip: {
    name: 'Reorder strip',
    summary: 'Order App home only.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  greeting: {
    name: 'Greeting',
    summary: 'Phone Order App welcome line.',
    placements: ['Order App phone home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
};

export function blockSurfaceFor(
  blockType: string,
  app: 'website' | 'order_app',
): ContentSurface {
  const meta = BLOCK_SURFACE_META[blockType];
  const base: ContentSurface = {
    id: `block_${blockType}`,
    name: meta?.name ?? blockType,
    summary: meta?.summary ?? 'Home page section',
    placements: (meta?.placements as SurfacePlacement[]) ?? (
      app === 'website' ? ['Website home'] : ['Order App phone home', 'Order App desktop home']
    ),
    kind: meta?.kind ?? 'reorderable_block',
    apps: meta?.apps ?? [app],
    actions: meta?.actions ?? ['edit', 'hide', 'reorder', 'remove', 'preview'],
    blockType,
    note: meta?.note,
    statusHint: meta?.statusHint,
  };

  // Website brand_footer is ignored by the renderer.
  if (blockType === 'brand_footer' && app === 'website') {
    return {
      ...base,
      kind: 'managed_elsewhere',
      statusHint: 'Managed elsewhere',
      actions: ['edit', 'preview'],
      placements: ['Website footer'],
      note: 'Website home does not render this layout row. Footer content is edited under Footer and shown site-wide.',
      group: 'Footer',
      managedBy: { label: 'Website footer', href: '/content?group=Footer' },
    };
  }

  return base;
}

/** Whether this block type is honoured by the given app’s home renderer. */
export function blockRenderedOnApp(blockType: string, app: 'website' | 'order_app'): boolean {
  if (app === 'website') {
    if (['brand_footer', 'greeting', 'prayer_bar', 'mode_cards', 'promo_carousel', 'opening_status', 'reviews', 'reorder_strip'].includes(blockType)) {
      return false;
    }
    return true;
  }
  // order_app
  if (['featured', 'proof', 'cta', 'location', 'faq_list'].includes(blockType)) {
    return false;
  }
  return true;
}

export function heroPromoConflict(types: string[]): boolean {
  const set = new Set(types);
  return set.has('hero') && set.has('promo_carousel');
}
