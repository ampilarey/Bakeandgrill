/**
 * Customer Surface Builder — mirrors backend SurfaceCatalog.php.
 * Placement records are per-app; device + slot live on each page_block.
 */

export const SURFACE_APPS = ['website', 'order_app'] as const;
export const SURFACE_DEVICES = ['desktop', 'mobile'] as const;
export const SURFACE_SLOTS = ['header', 'home', 'footer', 'bottom_navigation'] as const;

export type SurfaceApp = (typeof SURFACE_APPS)[number];
export type SurfaceDevice = (typeof SURFACE_DEVICES)[number];
export type SurfaceSlot = (typeof SURFACE_SLOTS)[number];

export type SurfaceRecord = {
  id: string;
  app: SurfaceApp;
  device: SurfaceDevice;
  slot: SurfaceSlot;
  label: string;
  description: string;
};

export function appLabel(app: SurfaceApp): string {
  return app === 'website' ? 'Website' : 'Order App';
}

export function deviceLabel(device: SurfaceDevice): string {
  return device === 'desktop' ? 'Desktop' : 'Mobile';
}

export function slotLabel(slot: SurfaceSlot): string {
  switch (slot) {
    case 'header':
      return 'Header';
    case 'home':
      return 'Home';
    case 'footer':
      return 'Footer';
    case 'bottom_navigation':
      return 'Bottom Navigation';
    default:
      return slot;
  }
}

export function surfaceId(app: SurfaceApp, device: SurfaceDevice, slot: SurfaceSlot): string {
  return `${app}.${device}.${slot}`;
}

/** Bottom navigation is mobile-only (phone chrome). Desktop has no bottom nav surface. */
export function slotsFor(app: SurfaceApp, device: SurfaceDevice): SurfaceSlot[] {
  if (device === 'mobile') {
    return ['header', 'home', 'footer', 'bottom_navigation'];
  }
  return ['header', 'home', 'footer'];
}

export function slotDescription(app: SurfaceApp, device: SurfaceDevice, slot: SurfaceSlot): string {
  const appName = appLabel(app);
  const deviceName = device === 'desktop' ? 'desktop' : 'mobile';

  switch (slot) {
    case 'header':
      return `Chrome at the top of the ${appName} ${deviceName} experience (logo row, prayer, announcements).`;
    case 'home':
      return `Main ${appName} ${deviceName} home scroll — greeting, hero, offers, and other sections.`;
    case 'footer':
      return 'Content/branding footer (contact, legal, thanks) — not the same as bottom navigation.';
    case 'bottom_navigation':
      return 'App tab bar (Menu, Orders, Account, …). Separate from the footer.';
    default:
      return '';
  }
}

export function allSurfaces(): SurfaceRecord[] {
  const surfaces: SurfaceRecord[] = [];
  for (const app of SURFACE_APPS) {
    for (const device of SURFACE_DEVICES) {
      for (const slot of slotsFor(app, device)) {
        surfaces.push({
          id: surfaceId(app, device, slot),
          app,
          device,
          slot,
          label: `${appLabel(app)} · ${deviceLabel(device)} · ${slotLabel(slot)}`,
          description: slotDescription(app, device, slot),
        });
      }
    }
  }
  return surfaces;
}

/** Component types allowed on a given slot (mirrors BlockTypeRegistry + SurfaceCatalog). */
export function typesForSlot(slot: SurfaceSlot): string[] {
  const homeTypes = [
    'greeting', 'prayer_bar', 'hero', 'announcement', 'service_availability',
    'opening_status', 'stat_chips', 'mode_cards', 'specials', 'featured',
    'categories', 'trust_strip', 'proof', 'reviews', 'reorder_strip', 'cta',
    'location', 'events_band', 'office_orders', 'brand_footer', 'rich_text',
    'image', 'image_text', 'video', 'button_band', 'faq_list', 'divider',
  ];

  switch (slot) {
    case 'header':
      return ['prayer_bar', 'announcement', 'greeting', 'opening_status', 'service_availability', 'stat_chips'];
    case 'home':
      return homeTypes;
    case 'footer':
      return ['site_footer', 'brand_footer', 'rich_text', 'button_band', 'divider', 'image', 'image_text'];
    case 'bottom_navigation':
      return ['bottom_nav'];
    default:
      return homeTypes;
  }
}

export function isValidSurface(app: string, device: string, slot: string): boolean {
  if (!SURFACE_APPS.includes(app as SurfaceApp) || !SURFACE_DEVICES.includes(device as SurfaceDevice)) {
    return false;
  }
  return slotsFor(app as SurfaceApp, device as SurfaceDevice).includes(slot as SurfaceSlot);
}

export type SurfaceFilter = {
  app: SurfaceApp;
  device: SurfaceDevice;
  slot: SurfaceSlot;
};

export function parseSurfaceId(id: string): SurfaceFilter | null {
  const parts = id.split('.');
  if (parts.length !== 3) return null;
  const [app, device, slot] = parts;
  if (!isValidSurface(app, device, slot)) return null;
  return { app: app as SurfaceApp, device: device as SurfaceDevice, slot: slot as SurfaceSlot };
}

export function surfaceBreadcrumb(filter: SurfaceFilter): string {
  return `${appLabel(filter.app)} · ${deviceLabel(filter.device)} · ${slotLabel(filter.slot)}`;
}

function slotSetting(settings: Record<string, unknown>, key: string, fallback: SurfaceSlot): SurfaceSlot {
  const v = settings[key];
  if (v === 'header' || v === 'home' || v === 'footer' || v === 'bottom_navigation') return v;
  return fallback;
}

function boolSetting(settings: Record<string, unknown>, key: string, fallback = true): boolean {
  if (!(key in settings)) return fallback;
  return Boolean(settings[key]);
}

/** Whether a page_block instance is visible on a device + slot. */
export function blockOnSurface(
  settings: Record<string, unknown> | undefined,
  device: SurfaceDevice,
  slot: SurfaceSlot,
): boolean {
  const s = settings ?? {};
  const visible = device === 'desktop'
    ? boolSetting(s, 'show_desktop', true)
    : boolSetting(s, 'show_mobile', true);
  if (!visible) return false;
  const placement = device === 'desktop'
    ? slotSetting(s, 'placement_desktop', 'home')
    : slotSetting(s, 'placement_mobile', 'home');
  return placement === slot;
}

export type BlockLike = {
  block_type: string;
  is_enabled: boolean;
  settings?: Record<string, unknown>;
};

/** Count enabled blocks on one surface for one app. */
export function countBlocksOnSurface(
  blocks: BlockLike[],
  device: SurfaceDevice,
  slot: SurfaceSlot,
): number {
  return blocks.filter(
    (b) => b.is_enabled && blockOnSurface(b.settings, device, slot),
  ).length;
}
