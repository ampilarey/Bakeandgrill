/**
 * Counting the shelf with a camera. Owner, 2026-09-06.
 *
 * Walk the store scanning packets: an item's own code adds one base unit to
 * its counted quantity; a pack's code adds the whole pack — one scan of a
 * 500 ml tin counts 500 ml. Typing stays available for the loose stuff.
 *
 * Unlike receiving there is no "due" to clamp to: the count is the truth
 * being established, so every scan simply adds.
 */
export type CountableItem = {
  id: number;
  name: string;
  unit: string;
  barcode?: string | null;
  sku?: string | null;
  purchase_units?: { id: number; name: string; base_units: number | string; barcode?: string | null }[] | null;
};

export function countScanIntoQtys(
  items: CountableItem[],
  qtys: Record<number, string>,
  code: string,
): { qtys: Record<number, string>; message: string; matchedId: number | null } {
  const wanted = code.trim();
  if (!wanted) return { qtys, message: 'Nothing scanned.', matchedId: null };
  const same = (v: string | null | undefined) =>
    typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() === wanted.toLowerCase();

  // Pack codes first — the more specific claim (see receivingScan).
  for (const item of items) {
    const pack = (item.purchase_units ?? []).find((p) => same(p.barcode));
    if (pack) {
      const step = Math.max(1, Number(pack.base_units) || 1);
      const next = (parseFloat(qtys[item.id] ?? '') || 0) + step;
      return {
        qtys: { ...qtys, [item.id]: String(next) },
        message: `${item.name} + 1 × ${pack.name} → ${next} ${item.unit}`,
        matchedId: item.id,
      };
    }
  }

  const item = items.find((i) => same(i.barcode)) ?? items.find((i) => same(i.sku)) ?? null;
  if (!item) {
    return { qtys, message: `No item has the code "${wanted}".`, matchedId: null };
  }

  const next = (parseFloat(qtys[item.id] ?? '') || 0) + 1;
  return {
    qtys: { ...qtys, [item.id]: String(next) },
    message: `${item.name} → ${next} ${item.unit}`,
    matchedId: item.id,
  };
}
