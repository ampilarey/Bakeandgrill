/**
 * Platter choice-group rules: exactly / min / range, with optional per-variant
 * size_counts.
 *
 * Shared rather than app-local since the POS learned to sell a platter
 * (owner's audit, 2026-09-06, F2). Two copies of "how many picks does this
 * group need" is two answers to the same question, and the answer the customer
 * gets and the answer the cashier gets have to be the same one.
 *
 * Client-side only, for the picker's own arithmetic — the server validates
 * every pick again and reads each surcharge from the definition, never from
 * the payload.
 */
import type { PlatterGroup, PlatterSelection } from '../types';

export type PlatterGroupCounts = { min: number | null; max: number | null };

export function resolveGroupCounts(
  group: Pick<PlatterGroup, 'rule_type' | 'min_count' | 'max_count' | 'size_counts'>,
  variantId?: number | null,
): PlatterGroupCounts {
  const sizeCounts = group.size_counts;
  if (sizeCounts && variantId != null) {
    const keyed = sizeCounts[String(variantId)];
    if (keyed != null && keyed > 0) {
      return { min: keyed, max: keyed };
    }
  }

  if (group.rule_type === 'exactly') {
    const n = group.min_count ?? group.max_count ?? 0;
    return { min: n, max: n };
  }
  if (group.rule_type === 'min') {
    return { min: group.min_count ?? 1, max: null };
  }
  // range
  return {
    min: group.min_count ?? 0,
    max: group.max_count ?? null,
  };
}

export function countSelectionsForGroup(
  selections: PlatterSelection[],
  groupId: number,
): number {
  return selections
    .filter((s) => s.group_id === groupId)
    .reduce((sum, s) => sum + Math.max(0, s.quantity), 0);
}

export function surchargeTotal(selections: PlatterSelection[]): number {
  return selections.reduce(
    (sum, s) => sum + Math.max(0, s.surcharge) * Math.max(0, s.quantity),
    0,
  );
}

/** How many more picks are needed across all groups (under their mins). */
export function remainingPicksNeeded(
  groups: PlatterGroup[],
  selections: PlatterSelection[],
  variantId?: number | null,
): number {
  let remaining = 0;
  for (const group of groups) {
    const { min } = resolveGroupCounts(group, variantId);
    if (min == null || min <= 0) continue;
    const have = countSelectionsForGroup(selections, group.id);
    if (have < min) remaining += min - have;
  }
  return remaining;
}

/** Plain customer hint — e.g. "Pick 2 more". Null when valid. */
export function platterPickHint(
  groups: PlatterGroup[],
  selections: PlatterSelection[],
  variantId?: number | null,
): string | null {
  const n = remainingPicksNeeded(groups, selections, variantId);
  if (n <= 0) return null;
  return `Pick ${n} more`;
}

export function isPlatterSelectionValid(
  groups: PlatterGroup[],
  selections: PlatterSelection[],
  variantId?: number | null,
): boolean {
  if (groups.length === 0) return false;

  const allowedByGroup = new Map<number, Set<number>>();
  for (const group of groups) {
    allowedByGroup.set(
      group.id,
      new Set(group.items.map((row) => row.item_id)),
    );
  }

  for (const sel of selections) {
    if (sel.quantity < 1) return false;
    const allowed = allowedByGroup.get(sel.group_id);
    if (!allowed || !allowed.has(sel.item_id)) return false;
  }

  for (const group of groups) {
    const { min, max } = resolveGroupCounts(group, variantId);
    const have = countSelectionsForGroup(selections, group.id);
    if (min != null && have < min) return false;
    if (max != null && have > max) return false;
  }

  return true;
}

/** Stable key so differently filled platters do not merge in the cart. */
export function platterSelectionsKey(selections: PlatterSelection[] | null | undefined): string {
  if (!selections || selections.length === 0) return '';
  return [...selections]
    .map((s) => `${s.group_id}:${s.item_id}x${s.quantity}`)
    .sort()
    .join(',');
}

/**
 * Apply +/- to a selection list. Respects group max when provided.
 * Returns null when the change would exceed max or pick an unallowed item.
 */
export function adjustPlatterSelection(
  groups: PlatterGroup[],
  selections: PlatterSelection[],
  groupId: number,
  itemId: number,
  delta: number,
  variantId?: number | null,
): PlatterSelection[] | null {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const row = group.items.find((r) => r.item_id === itemId);
  if (!row) return null;

  const { max } = resolveGroupCounts(group, variantId);
  const currentQty = selections
    .filter((s) => s.group_id === groupId && s.item_id === itemId)
    .reduce((sum, s) => sum + s.quantity, 0);
  const groupTotal = countSelectionsForGroup(selections, groupId);
  const nextQty = currentQty + delta;

  if (nextQty < 0) return null;
  if (delta > 0 && max != null && groupTotal + delta > max) return null;

  const without = selections.filter(
    (s) => !(s.group_id === groupId && s.item_id === itemId),
  );
  if (nextQty === 0) return without;

  return [
    ...without,
    {
      group_id: groupId,
      item_id: itemId,
      item_name: row.item?.name ?? `Item #${itemId}`,
      quantity: nextQty,
      surcharge: Math.max(0, Number(row.surcharge) || 0),
    },
  ];
}
