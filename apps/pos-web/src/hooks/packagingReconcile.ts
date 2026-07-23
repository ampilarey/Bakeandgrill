import type { CartItem, Item, PackagingOption } from "../types";
import { isPackagingEligible, type PosOrderType } from "../orderTypes";
import { makeCartKey, resolvePackagingSnapshot } from "./useCart";

export type PackagingPickerLine = {
  /** Cart line key after reconcile auto-apply/merge (makeCartKey). */
  lineKey: string;
  itemId: number;
  itemName: string;
  quantity: number;
  options: PackagingOption[];
};

export type PackagingReconcileResult = {
  items: CartItem[];
  needsPicker: PackagingPickerLine[];
};

function catalogOptions(item: Item): PackagingOption[] {
  return (item.packaging_options ?? []).filter(
    (o): o is PackagingOption => o != null && Number.isFinite(Number(o.id)),
  );
}

function lineKey(line: CartItem): string {
  return makeCartKey(
    line.id,
    line.modifiers,
    line.variant_id,
    line.notes,
    line.packaging_option_id,
  );
}

/** Merge lines that share the same makeCartKey (sum quantities, keep first snapshot). */
export function mergeCartLinesByPackagingKey(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const line of items) {
    const key = lineKey(line);
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, quantity: existing.quantity + line.quantity });
    } else {
      map.set(key, { ...line });
    }
  }
  return [...map.values()];
}

/** Strip packaging snapshots (dine-in / ineligible). Merges lines that collapse. */
export function stripCartLinePackaging(items: CartItem[]): CartItem[] {
  return mergeCartLinesByPackagingKey(
    items.map((line) => ({
      ...line,
      packaging_fee: 0,
      packaging_option_id: null,
      packaging_option_name: null,
    })),
  );
}

/**
 * When switching to an eligible order type: auto-apply single-option packaging;
 * queue multi-option lines that lack a valid option for the forced picker.
 * Menu-missing items are left unchanged.
 */
export function reconcilePackagingOnEligibleSwitch(
  items: CartItem[],
  menuById: Map<number, Item>,
): PackagingReconcileResult {
  const next = items.map((line) => {
    const menuItem = menuById.get(line.id);
    if (!menuItem) return line;

    const options = catalogOptions(menuItem);
    if (options.length === 0) return line;

    if (options.length === 1) {
      const snap = resolvePackagingSnapshot(menuItem, options[0].id);
      return { ...line, ...snap };
    }

    const currentValid =
      line.packaging_option_id != null &&
      options.some((o) => o.id === line.packaging_option_id);

    if (currentValid) {
      const snap = resolvePackagingSnapshot(menuItem, line.packaging_option_id);
      return { ...line, ...snap };
    }

    return line;
  });

  const merged = mergeCartLinesByPackagingKey(next);
  const needsPicker: PackagingPickerLine[] = [];
  for (const line of merged) {
    const menuItem = menuById.get(line.id);
    if (!menuItem) continue;
    const options = catalogOptions(menuItem);
    if (options.length < 2) continue;
    const currentValid =
      line.packaging_option_id != null &&
      options.some((o) => o.id === line.packaging_option_id);
    if (currentValid) continue;
    needsPicker.push({
      lineKey: lineKey(line),
      itemId: line.id,
      itemName: line.name,
      quantity: line.quantity,
      options: options.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    });
  }

  return { items: merged, needsPicker };
}

/** Apply cashier packaging picks from the forced modal, then merge. */
export function applyPackagingPickerSelections(
  items: CartItem[],
  selections: Record<string, number>,
  menuById: Map<number, Item>,
): CartItem[] {
  const next = items.map((line) => {
    const key = lineKey(line);
    const optionId = selections[key];
    if (optionId == null) return line;
    const menuItem = menuById.get(line.id);
    if (!menuItem) return line;
    const snap = resolvePackagingSnapshot(menuItem, optionId);
    return { ...line, ...snap };
  });
  return mergeCartLinesByPackagingKey(next);
}

/**
 * Cashier order-type toggle reconcile (pure). Returns updated cart + optional
 * picker payload. Callers that load/resume tickets should NOT use this.
 */
export function reconcileCartPackagingForOrderTypeToggle(
  nextType: PosOrderType,
  items: CartItem[],
  menuItems: Item[],
): PackagingReconcileResult {
  if (!isPackagingEligible(nextType)) {
    return { items: stripCartLinePackaging(items), needsPicker: [] };
  }
  const menuById = new Map(menuItems.map((i) => [i.id, i]));
  return reconcilePackagingOnEligibleSwitch(items, menuById);
}
