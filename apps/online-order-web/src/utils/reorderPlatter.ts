/**
 * Re-order helpers for platter lines.
 * Never silently add an empty platter — replay children or signal picker needed.
 */
import type { PlatterSelection } from '@shared/types';

export type ReorderLine = {
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  variant_id?: number | null;
  is_platter?: boolean;
  children?: Array<{
    item_id: number;
    item_name: string;
    quantity: number;
    unit_price?: number;
    surcharge?: number;
    group_id?: number;
  }>;
  modifiers?: Array<{ id: number; name: string; price: number }>;
  name?: string;
  price?: number;
};

export type ReorderApplyResult = {
  /** Lines ready for cart (parents with structured platterSelections). */
  lines: Array<{
    item_id: number;
    item_name: string;
    quantity: number;
    unit_price: number;
    variant_id?: number | null;
    modifiers: Array<{ id: number; name: string; price: number }>;
    platterSelections: PlatterSelection[];
    is_platter: boolean;
  }>;
  /** Platter parents with no child picks — open the picker instead of empty cart add. */
  needsPicker: Array<{ item_id: number; item_name: string; quantity: number; variant_id?: number | null }>;
};

export function applyReorderLines(items: ReorderLine[]): ReorderApplyResult {
  const lines: ReorderApplyResult['lines'] = [];
  const needsPicker: ReorderApplyResult['needsPicker'] = [];

  for (const line of items) {
    const isPlatter = Boolean(line.is_platter);
    const children = line.children ?? [];
    const mods = (line.modifiers ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price ?? 0,
    }));

    if (isPlatter && children.length === 0) {
      needsPicker.push({
        item_id: line.item_id,
        item_name: line.item_name ?? line.name ?? 'Platter',
        quantity: line.quantity,
        variant_id: line.variant_id ?? null,
      });
      continue;
    }

    const platterSelections: PlatterSelection[] = children.map((c) => ({
      group_id: c.group_id ?? 0,
      item_id: c.item_id,
      item_name: c.item_name,
      quantity: c.quantity,
      surcharge: Math.max(0, Number(c.surcharge ?? c.unit_price ?? 0)),
    }));

    lines.push({
      item_id: line.item_id,
      item_name: line.item_name ?? line.name ?? 'Item',
      quantity: line.quantity,
      unit_price: line.unit_price ?? line.price ?? 0,
      variant_id: line.variant_id ?? null,
      modifiers: mods,
      platterSelections,
      is_platter: isPlatter,
    });
  }

  return { lines, needsPicker };
}
