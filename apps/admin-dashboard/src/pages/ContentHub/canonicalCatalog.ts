/**
 * Canonical Content & Branding component catalog.
 *
 * Admin surface cards, editor lists, counts, and integrity checks MUST use this
 * module — not independent regex/group counters or the full type library.
 *
 * Identity shape (page_block instances):
 *   app · page · surface(slot) · viewport(device) · component_id · component_type
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
  /** Block row id when sourced from page_blocks. */
  block_id: number;
  status: 'active' | 'needs_review' | 'archived';
  legacy_source?: string | null;
};

export type BlockInstance = BlockLike & {
  id: number;
  label?: string;
  position?: number;
  unknown?: boolean;
};

/** Enabled blocks that render on a given surface — source of truth for card counts. */
export function listComponentsOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  page = 'home',
): CanonicalComponent[] {
  const allowed = new Set(typesForSlot(filter.slot));
  return blocks
    .filter((b) => b.is_enabled && blockOnSurface(b.settings, filter.device, filter.slot))
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((b) => toCanonical(b, filter, page, allowed.has(b.block_type)));
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
  return listComponentsOnSurface(blocks, filter).length;
}

/** Types allowed on a slot that are not yet represented by an enabled instance on that surface. */
export function addableTypesOnSurface(
  blocks: BlockInstance[],
  filter: SurfaceFilter,
  availableTypes: string[],
): string[] {
  const onSurface = new Set(
    listComponentsOnSurface(blocks, filter).map((c) => c.component_type),
  );
  const slotTypes = typesForSlot(filter.slot);
  return availableTypes.filter(
    (t) => slotTypes.includes(t) && !onSurface.has(t),
  );
}

/** Default placement settings when adding a block from a surface card. */
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

/**
 * Detect duplicate active identities (same app/page/surface/viewport/position
 * with more than one enabled component when types collide on singleton slots).
 */
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

/** Content Hub keys that must never appear as editable customer content. */
export function isOperationalContentKey(key: string): boolean {
  return isOpsOwnedContentKey(key);
}
