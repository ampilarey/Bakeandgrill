/** Sum laari/MVR line totals for selected split items (display uses toFixed(2)). */
export function splitSelectedItemsTotal(
  items: ReadonlyArray<{ id: number; total_price?: number | string | null }>,
  selectedIds: ReadonlySet<number>,
): number {
  return items
    .filter((it) => selectedIds.has(it.id))
    .reduce((acc, it) => acc + Number(it.total_price ?? 0), 0);
}
