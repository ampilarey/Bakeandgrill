/**
 * Category nesting helpers for the POS menu.
 *
 * Extracted from usePosApp so the rule the owner actually asked for —
 * "when main category is selected without selecting subcategory, all items in
 * all the subcategories must show" (2026-08-18) — can be stated in a test
 * rather than buried in a 1,300-line hook.
 */

type CategoryLike = { id: number; parent_id?: number | null };

/**
 * The selected category plus every category beneath it.
 *
 * A parent is a heading, not a shelf: its items usually live on its children,
 * so selecting "Food" has to reach into "Shorteats" and "Fast food" or the
 * grid comes back empty and the parent pill looks broken.
 *
 * Walks the tree rather than checking one level, so an extra tier added later
 * keeps working, with a depth stop so a cycle in the data cannot hang the till.
 */
export function categoryWithDescendants(
  categories: ReadonlyArray<CategoryLike>,
  selectedId: number,
): Set<number> {
  const matchIds = new Set<number>([selectedId]);

  // Index children once — scanning the whole list per level is fine for a
  // menu, but this keeps it linear as the menu grows.
  const childrenOf = new Map<number, number[]>();
  for (const c of categories) {
    if (c.parent_id == null) continue;
    const siblings = childrenOf.get(c.parent_id) ?? [];
    siblings.push(c.id);
    childrenOf.set(c.parent_id, siblings);
  }

  let frontier: number[] = [selectedId];
  for (let depth = 0; depth < 16 && frontier.length; depth += 1) {
    const next: number[] = [];
    for (const parentId of frontier) {
      for (const childId of childrenOf.get(parentId) ?? []) {
        if (matchIds.has(childId)) continue;
        matchIds.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }

  return matchIds;
}

/**
 * Items to show for the current selection.
 *
 * `selectedId == null` is the "All items" tab and returns everything.
 */
export function itemsForCategory<T extends { category_id?: number | null; extra_category_ids?: number[] | null }>(
  items: ReadonlyArray<T>,
  categories: ReadonlyArray<CategoryLike>,
  selectedId: number | null,
): T[] {
  if (selectedId == null) return items as T[];
  const matchIds = categoryWithDescendants(categories, selectedId);

  // An item sits under its home category and under any "also show in"
  // category (owner, 2026-09-03: Bajiya under Kulhi Hedhikaa and Evening Tea).
  return items.filter((item) =>
    (item.category_id != null && matchIds.has(item.category_id))
    || (item.extra_category_ids ?? []).some((id) => matchIds.has(id)));
}
