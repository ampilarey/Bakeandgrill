/** Sum MVR for selected split items, allocating order total by line share. */
export function splitSelectedItemsTotal(
  items: ReadonlyArray<{ id: number; total_price?: number | string | null }>,
  selectedIds: ReadonlySet<number>,
  orderTotalMvr?: number | string | null,
): number {
  const selected = items.filter((it) => selectedIds.has(it.id));
  if (selected.length === 0) return 0;

  const selectedLines = selected.reduce((acc, it) => acc + Number(it.total_price ?? 0), 0);
  const allLines = items.reduce((acc, it) => acc + Number(it.total_price ?? 0), 0);
  const orderTotal = Number(orderTotalMvr ?? 0);

  // When we know the order grand total, allocate proportionally so tax /
  // discount / SC share moves with the selected lines (not pre-tax only).
  if (orderTotal > 0 && allLines > 0) {
    return Math.round(((selectedLines / allLines) * orderTotal) * 100) / 100;
  }

  return selectedLines;
}
