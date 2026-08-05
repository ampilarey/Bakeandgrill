import type { Item, Modifier } from '../api';
import type { ReorderPayload } from '../api/orders';
import { applyReorderLines } from './reorderPlatter';

const PENDING_PLATTER_KEY = 'bakegrill_pending_platter_reorder';

export function stashPendingPlatterReorder(
  needsPicker: Array<{ item_id: number; item_name: string; quantity: number; variant_id?: number | null }>,
): void {
  if (typeof sessionStorage === 'undefined' || needsPicker.length === 0) return;
  try {
    sessionStorage.setItem(PENDING_PLATTER_KEY, JSON.stringify(needsPicker));
  } catch {
    /* ignore */
  }
}

export function consumePendingPlatterReorder(): Array<{
  item_id: number;
  item_name: string;
  quantity: number;
  variant_id?: number | null;
}> {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(PENDING_PLATTER_KEY);
    sessionStorage.removeItem(PENDING_PLATTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type AddItemFn = (
  item: Item,
  quantity: number,
  modifiers?: Modifier[],
  variant?: null,
  packagingOptionId?: number | null,
  options?: { platterSelections?: import('@shared/types').PlatterSelection[] },
) => void;

/**
 * Apply a reorder payload to the cart. Returns how many units were added and
 * whether any platter lines need the picker (never silently empty).
 */
export function applyReorderPayloadToCart(
  payload: ReorderPayload,
  addItem: AddItemFn,
): { added: number; needsPickerCount: number } {
  const { lines, needsPicker } = applyReorderLines(payload.items);
  stashPendingPlatterReorder(needsPicker);

  let added = 0;
  for (const line of lines) {
    const fakeItem = {
      id: line.item_id,
      name: line.item_name,
      base_price: line.unit_price,
      has_variants: false,
      is_available: true,
      is_platter: line.is_platter,
    } as Item;
    addItem(
      fakeItem,
      line.quantity,
      line.modifiers as Modifier[],
      null,
      null,
      { platterSelections: line.platterSelections },
    );
    added += line.quantity;
  }

  return { added, needsPickerCount: needsPicker.length };
}
