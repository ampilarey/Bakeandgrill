/**
 * Receiving a delivery by scanning packets. Owner, 2026-09-02.
 *
 * A scan finds the purchase line whose stock item carries that barcode and
 * counts one more of it received. The match is exact on the stored barcode,
 * with the SKU as a fallback for suppliers who print their own code.
 */
export type ScannablePurchaseItem = {
  id: number;
  quantity: number;
  received_quantity: number;
  inventory_item: { id: number; name: string; barcode?: string | null; sku?: string | null } | null;
};

export function matchPurchaseItemByCode<T extends ScannablePurchaseItem>(items: T[], code: string): T | null {
  const wanted = code.trim();
  if (!wanted) return null;
  const same = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() === wanted.toLowerCase();
  return items.find((i) => same(i.inventory_item?.barcode)) ?? items.find((i) => same(i.inventory_item?.sku)) ?? null;
}

/**
 * One more of the scanned line, never beyond what is still due. Returns the
 * next quantity map and what happened, so the page can say it.
 */
export function countScannedItem<T extends ScannablePurchaseItem>(
  items: T[],
  qtys: Record<number, number>,
  code: string,
): { qtys: Record<number, number>; message: string; matched: T | null } {
  const item = matchPurchaseItemByCode(items, code);
  if (!item) return { qtys, message: `Nothing on this order has the code "${code.trim()}".`, matched: null };
  const due = Math.max(0, item.quantity - item.received_quantity);
  const current = qtys[item.id] ?? 0;
  if (current >= due) {
    return { qtys, message: `${item.inventory_item?.name ?? 'That item'} is already at ${due}, all that is still due.`, matched: item };
  }
  const next = current + 1;
  return {
    qtys: { ...qtys, [item.id]: next },
    message: `${item.inventory_item?.name ?? 'Item'}: ${next} of ${due} received.`,
    matched: item,
  };
}
