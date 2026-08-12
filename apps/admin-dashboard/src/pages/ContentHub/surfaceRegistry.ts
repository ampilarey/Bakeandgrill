/**
 * Customer Surface Map — placements and labels for Content & Branding.
 * Home components are dual-app; no fake “injected” modules remain.
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
  | 'managed_elsewhere';

export type SurfaceAction = 'edit' | 'hide' | 'reorder' | 'remove' | 'preview';

export type ContentSurface = {
  id: string;
  name: string;
  summary: string;
  placements: SurfacePlacement[];
  kind: SurfaceKind;
  apps: Array<'website' | 'order_app'>;
  actions: SurfaceAction[];
  group?: string;
  homeAppHint?: 'website' | 'order_app';
  managedBy?: { label: string; href: string };
  note?: string;
  blockType?: string;
  statusHint?: 'Showing' | 'Hidden' | 'Fixed' | 'Shared' | 'Managed elsewhere';
};

/** Site-wide chrome that is not a Home component (legal footer, etc.). */
export const WEBSITE_HOME_FIXED_MODULES: ContentSurface[] = [
  {
    id: 'website_site_footer',
    name: 'Website legal footer',
    summary: 'Site-wide footer links and legal — separate from Brand footer Home component.',
    placements: ['Website footer'],
    kind: 'fixed_editable',
    apps: ['website'],
    actions: ['edit', 'preview'],
    group: 'Footer',
    statusHint: 'Fixed',
    note: 'Always wraps Website pages. Brand footer on Home is a separate component you can add or hide.',
  },
];

export const ORDER_HOME_FIXED_MODULES: ContentSurface[] = [];

export const BLOCK_SURFACE_META: Record<string, Partial<ContentSurface>> = {
  hero: {
    name: 'Hero banner / promotional carousel',
    summary: 'Slideshow from hero_slides. Promo carousel was merged into this component.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  promo_carousel: {
    name: 'Promo carousel (legacy)',
    summary: 'Merged into Hero — migrate away from this type.',
    placements: ['Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
    note: 'Deprecated. Use Hero banner / promotional carousel.',
  },
  prayer_bar: {
    name: 'Prayer Time Banner',
    summary: 'Full prayer banner — Home or header, per device, per app.',
    placements: [
      'Website header',
      'Website home',
      'Order App desktop header',
      'Order App phone home',
      'Order App desktop home',
    ],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  brand_footer: {
    name: 'Brand footer / Home footer',
    summary: 'Home footer with chat links — independent per app.',
    placements: ['Website home', 'Order App footer'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  mode_cards: {
    name: 'Order mode cards',
    summary: 'Delivery, Pickup, Dine-in.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  opening_status: {
    name: 'Opening status',
    summary: 'Open/closed badge at its own placement.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  trust_strip: {
    name: 'Trust strip',
    summary: 'Trust signals — only where placed in the layout.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  featured: {
    name: 'Featured items',
    summary: 'Highlighted menu items on either Home.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  proof: {
    name: 'Social proof',
    summary: 'Stats and trust numbers.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  cta: {
    name: 'Call-to-action band',
    summary: 'Order CTA band.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  location: {
    name: 'Location / map',
    summary: 'Address and directions.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  reviews: {
    name: 'Customer reviews',
    summary: 'Recent reviews.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  reorder_strip: {
    name: 'Reorder strip',
    summary: 'One-tap reorder.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
  greeting: {
    name: 'Greeting / welcome',
    summary: 'Welcome line.',
    placements: ['Website home', 'Order App phone home', 'Order App desktop home'],
    kind: 'reorderable_block',
    actions: ['edit', 'hide', 'reorder', 'remove', 'preview'],
  },
};

export function blockSurfaceFor(
  blockType: string,
  app: 'website' | 'order_app',
): ContentSurface {
  const meta = BLOCK_SURFACE_META[blockType];
  return {
    id: `block_${blockType}`,
    name: meta?.name ?? blockType,
    summary: meta?.summary ?? 'Home page section',
    placements: (meta?.placements as SurfacePlacement[]) ?? (
      app === 'website'
        ? ['Website home']
        : ['Order App phone home', 'Order App desktop home']
    ),
    kind: meta?.kind ?? 'reorderable_block',
    apps: meta?.apps ?? ['website', 'order_app'],
    actions: meta?.actions ?? ['edit', 'hide', 'reorder', 'remove', 'preview'],
    blockType,
    note: meta?.note,
    statusHint: meta?.statusHint,
  };
}

/** Every known Home component type renders on both apps. */
export function blockRenderedOnApp(_blockType: string, _app: 'website' | 'order_app'): boolean {
  return true;
}

/** Hero + legacy promo both active (should not happen after migration). */
export function heroPromoConflict(types: string[]): boolean {
  const set = new Set(types);
  return set.has('hero') && set.has('promo_carousel');
}
