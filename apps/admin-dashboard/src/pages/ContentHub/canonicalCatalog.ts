/**
 * Canonical Content & Branding component catalog.
 *
 * Surface-card counts, the configured-component editor list, Add picker,
 * preview context, and duplicate checks MUST use these helpers — never the
 * full type library or independent regex counters.
 *
 * Identity: app · page · surface(slot) · viewport(device) · component_id · type
 */

import {
  blockOnSurface,
  surfaceId,
  typesForSlot,
  type BlockLike,
  type SurfaceApp,
  type SurfaceDevice,
  type SurfaceFilter,
  type SurfaceSlot,
} from './surfaceCatalog';
import { isOpsOwnedContentKey } from './opsOwnedContentKeys';

export type CanonicalOwner = 'content_branding' | 'business_details' | 'delivery_settings' | 'ops_other';

export type CanonicalComponent = {
  /** Stable id for this instance on this surface (app.device.slot.blockId). */
  component_id: string;
  component_type: string;
  app: SurfaceApp;
  page: string;
  surface: SurfaceSlot;
  viewport: SurfaceDevice;
  position: number;
  enabled: boolean;
  owner: CanonicalOwner;
  label: string;
  block_id: number;
  status: 'active' | 'needs_review' | 'archived';
  legacy_source?: string | null;
};

export type BlockInstance = BlockLike & {
  id: number;
  label?: string;
  position?: number;
  unknown?: boolean;
  allows_multiple?: boolean;
};

/** Types that may only appear once per app × surface × device. */
export const SINGLETON_SURFACE_TYPES = new Set([
  'prayer_bar',
  'announcement',
  'bottom_nav',
  'site_footer',
  'brand_footer',
  'opening_status',
  'service_availability',
  'greeting',
  'stat_chips',
  'mode_cards',
  'hero',
  'specials',
  'featured',
  'categories',
  'trust_strip',
  'proof',
  'reviews',
  'reorder_strip',
  'cta',
  'location',
  'events_band',
  'office_orders',
]);

export function isSingletonSurfaceType(type: string): boolean {
  return SINGLETON_SURFACE_TYPES.has(type);
}

/**
 * Exact instances placed on a surface (enabled or not).
 * Filters by app (caller passes app-scoped blocks), device visibility, and slot placement.
 */
export function listPlacedOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  page = 'home',
): CanonicalComponent[] {
  const allowed = new Set(typesForSlot(filter.slot));
  return blocks
    .filter((b) => blockOnSurface(b.settings, filter.device, filter.slot))
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((b) => toCanonical(b, filter, page, allowed.has(b.block_type)));
}

/** Configured + showing (enabled) — source of truth for “N components” card labels. */
export function listConfiguredOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  page = 'home',
): CanonicalComponent[] {
  return listPlacedOnSurface(blocks, filter, page).filter((c) => c.enabled);
}

/** Placed on the surface but disabled — show separately as Hidden, never in the live count. */
export function listHiddenOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  page = 'home',
): CanonicalComponent[] {
  return listPlacedOnSurface(blocks, filter, page).filter((c) => !c.enabled);
}

/** @deprecated Use listConfiguredOnSurface — kept as alias for call sites. */
export function listComponentsOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  page = 'home',
): CanonicalComponent[] {
  return listConfiguredOnSurface(blocks, filter, page);
}

function toCanonical(
  b: BlockInstance,
  filter: SurfaceFilter,
  page: string,
  typeAllowedOnSlot: boolean,
): CanonicalComponent {
  const device = filter.device;
  const needsReview = Boolean(b.unknown) || !typeAllowedOnSlot;
  return {
    component_id: `${filter.app}.${device}.${filter.slot}.${b.id}`,
    component_type: b.block_type,
    app: filter.app,
    page,
    surface: filter.slot,
    viewport: device,
    position: b.position ?? 0,
    enabled: b.is_enabled,
    owner: 'content_branding',
    label: b.label ?? b.block_type,
    block_id: b.id,
    status: needsReview ? 'needs_review' : 'active',
    legacy_source: needsReview
      ? (b.unknown ? `unknown_block_type:${b.block_type}` : `wrong_slot:${b.block_type}@${filter.slot}`)
      : null,
  };
}

export function countComponentsOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
): number {
  return listConfiguredOnSurface(blocks, filter).length;
}

export function countHiddenOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
): number {
  return listHiddenOnSurface(blocks, filter).length;
}

export type SurfaceCountLabel = {
  showing: number;
  hidden: number;
  /** Card chip text, e.g. "2 components" or "2 components · 1 hidden". */
  label: string;
};

export function surfaceCountLabel(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
): SurfaceCountLabel {
  const showing = countComponentsOnSurface(blocks, filter);
  const hidden = countHiddenOnSurface(blocks, filter);
  if (hidden > 0) {
    return {
      showing,
      hidden,
      label: `${showing} component${showing === 1 ? '' : 's'} · ${hidden} hidden`,
    };
  }
  return {
    showing,
    hidden: 0,
    label: `${showing} component${showing === 1 ? '' : 's'}`,
  };
}

/**
 * Types offered in the Add Component picker for this surface.
 * Singletons already configured (enabled or hidden) are excluded.
 * Multi-instance types remain available.
 */
export function addableTypesOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  availableTypes: string[],
  allowsMultiple?: (type: string) => boolean,
): string[] {
  const placedTypes = new Set(
    listPlacedOnSurface(blocks, filter).map((c) => c.component_type),
  );
  const slotTypes = typesForSlot(filter.slot);
  return availableTypes.filter((t) => {
    if (!slotTypes.includes(t)) return false;
    const multi = allowsMultiple ? allowsMultiple(t) : !isSingletonSurfaceType(t);
    if (multi) return true;
    return !placedTypes.has(t);
  });
}

/** Default placement when creating from a surface card — one instance, this device+slot. */
export function placementSettingsForSurface(filter: SurfaceFilter): Record<string, unknown> {
  if (filter.device === 'desktop') {
    return {
      show_desktop: true,
      show_mobile: false,
      placement_desktop: filter.slot,
      placement_mobile: 'home',
    };
  }
  return {
    show_desktop: false,
    show_mobile: true,
    placement_desktop: 'home',
    placement_mobile: filter.slot,
  };
}

export function surfaceAddress(filter: SurfaceFilter): string {
  return surfaceId(filter.app, filter.device, filter.slot);
}

/** Default surface when Homepage opens without an explicit card (home slot). */
export function defaultHomeSurface(
  app: SurfaceApp,
  device: SurfaceDevice = 'desktop',
): SurfaceFilter {
  return { app, device, slot: 'home' };
}

/**
 * Duplicate singleton types on the same app/device/surface (enabled or hidden).
 */
export function findSingletonDuplicatesOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
): Array<{ type: string; component_ids: string[] }> {
  const placed = listPlacedOnSurface(blocks, filter);
  const byType = new Map<string, string[]>();
  for (const c of placed) {
    if (!isSingletonSurfaceType(c.component_type)) continue;
    const list = byType.get(c.component_type) ?? [];
    list.push(c.component_id);
    byType.set(c.component_type, list);
  }
  const out: Array<{ type: string; component_ids: string[] }> = [];
  for (const [type, ids] of byType) {
    if (ids.length > 1) out.push({ type, component_ids: ids });
  }
  return out;
}

export function findDuplicateIdentities(components: CanonicalComponent[]): string[] {
  const seen = new Map<string, CanonicalComponent>();
  const dupes: string[] = [];
  for (const c of components) {
    if (!c.enabled || c.status === 'archived') continue;
    const key = `${c.app}|${c.page}|${c.surface}|${c.viewport}|${c.component_type}|${c.position}`;
    const prev = seen.get(key);
    if (prev) {
      dupes.push(`${c.component_id} conflicts with ${prev.component_id}`);
    } else {
      seen.set(key, c);
    }
  }
  return dupes;
}

export function isOperationalContentKey(key: string): boolean {
  return isOpsOwnedContentKey(key);
}
