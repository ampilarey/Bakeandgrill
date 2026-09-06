/**
 * Receiving a delivery by scanning packets. Owner, 2026-09-02.
 *
 * A scan finds the purchase line whose stock item carries that barcode and
 * counts one more of it received. The match is exact on the stored barcode,
 * with the SKU as a fallback for suppliers who print their own code.
 */
export type ScannablePack = { id: number; name: string; base_units: number | string; barcode?: string | null };

export type ScannablePurchaseItem = {
  id: number;
  quantity: number;
  received_quantity: number;
  inventory_item: {
    id: number;
    name: string;
    barcode?: string | null;
    sku?: string | null;
    /** The packs this item is bought in, each with its own shelf EAN. */
    purchase_units?: ScannablePack[] | null;
  } | null;
};

/** What a scan resolved to: the line, and the pack when the code was a pack's. */
export type ScanMatch<T extends ScannablePurchaseItem> = { item: T; pack: ScannablePack | null };

export function matchPurchaseItemByCode<T extends ScannablePurchaseItem>(items: T[], code: string): ScanMatch<T> | null {
  const wanted = code.trim();
  if (!wanted) return null;
  const same = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() === wanted.toLowerCase();

  /*
   * Packs first: a pack barcode is the more specific claim — "a 500 ml tin of
   * this ghee" — and the whole reason packs carry codes is that the item's
   * single barcode cannot say which size arrived.
   */
  for (const i of items) {
    const pack = (i.inventory_item?.purchase_units ?? []).find((p) => same(p.barcode));
    if (pack) return { item: i, pack };
  }

  const byItem = items.find((i) => same(i.inventory_item?.barcode)) ?? items.find((i) => same(i.inventory_item?.sku)) ?? null;
  return byItem ? { item: byItem, pack: null } : null;
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
  const match = matchPurchaseItemByCode(items, code);
  if (!match) return { qtys, message: `Nothing on this order has the code "${code.trim()}".`, matched: null };

  const { item, pack } = match;
  const name = item.inventory_item?.name ?? 'Item';
  // A pack scan counts the whole pack; an item scan counts one base unit.
  const step = pack ? Math.max(1, Number(pack.base_units) || 1) : 1;
  const due = Math.max(0, item.quantity - item.received_quantity);
  const current = qtys[item.id] ?? 0;

  if (current >= due) {
    return { qtys, message: `${name} is already at ${due}, all that is still due.`, matched: item };
  }

  // Never past what is still due: the last tin of an odd order tops the
  // line up rather than overshooting it.
  const next = Math.min(due, current + step);
  const said = pack ? ` (1 × ${pack.name})` : '';
  return {
    qtys: { ...qtys, [item.id]: next },
    message: `${name}${said}: ${next} of ${due} received.`,
    matched: item,
  };
}
