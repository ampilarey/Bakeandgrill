import type { LabelDesign, LabelArrangement, LabelPartOverride, LabelSpotKey } from '../../api';

/*
 * The drag designer (round 8 of the usability work, owner, 2026-10-13: "a
 * drag-and-drop designer on the sticker: move and resize text and pictures,
 * with Back to automatic"). A product keeps, per design, the parts moved or
 * resized by hand on the preview: a shift in mm and a scale, keyed by the
 * part's spot (`label_layout`, the LabelArrangement type; LabelLayout on the
 * server tidies it the same way). A drag adds to the shift, a resize multiplies the scale; a
 * part back where the design put it drops out; Back to automatic forgets a
 * design's overrides.
 */

export const MOVABLE_DESIGNS = ['full', 'mini', 'small', 'round'] as const;
export type MovableDesign = (typeof MOVABLE_DESIGNS)[number];

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2;
export const MAX_MM = 300;

export function isMovable(design: LabelDesign | string | null | undefined): design is MovableDesign {
  return (MOVABLE_DESIGNS as readonly string[]).includes(design ?? '');
}

const mm = (v: number) => Math.round(Math.max(-MAX_MM, Math.min(MAX_MM, v)) * 10) / 10;
const scale = (v: number) => Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, v)) * 100) / 100;

/** A part moved by (dx, dy) mm and scaled by `s` on top of what it already has. */
export function nudgeSpot(layout: LabelArrangement, design: MovableDesign, key: LabelSpotKey, change: { dx?: number; dy?: number; s?: number }): LabelArrangement {
  const cur: LabelPartOverride = layout[design]?.[key] ?? { dx: 0, dy: 0, s: 1 };
  const next: LabelPartOverride = { dx: mm(cur.dx + (change.dx ?? 0)), dy: mm(cur.dy + (change.dy ?? 0)), s: scale(cur.s * (change.s ?? 1)) };
  const parts = { ...(layout[design] ?? {}) };
  if (next.dx === 0 && next.dy === 0 && next.s === 1) delete parts[key];
  else parts[key] = next;
  const out: LabelArrangement = { ...layout };
  if (Object.keys(parts).length === 0) delete out[design];
  else out[design] = parts;
  return out;
}

/** Back to automatic: the design's overrides forgotten. */
export function clearDesign(layout: LabelArrangement, design: MovableDesign): LabelArrangement {
  const out: LabelArrangement = { ...layout };
  delete out[design];
  return out;
}

export function hasOverrides(layout: LabelArrangement | null | undefined, design: MovableDesign): boolean {
  return Object.keys(layout?.[design] ?? {}).length > 0;
}

/** A layout as the server takes it: nothing kept is null, so the product forgets it. */
export function layoutPayload(layout: LabelArrangement): LabelArrangement | null {
  return Object.keys(layout).length > 0 ? layout : null;
}
