import type { Item } from "../types";

/**
 * Whether a tap on this item opens the Configure panel rather than adding it
 * straight to the ticket: a platter is nothing but a choice, modifiers and
 * sizes need picking, and more than one packaging option needs choosing on a
 * type that charges packaging. One rule for the menu tiles, the suggestion
 * strip and the order type ask, which runs it again once the type is known.
 */
export function itemNeedsConfigure(item: Item, packagingEligible: boolean): boolean {
  return (
    (item.platter_groups?.length ?? 0) > 0
    || (item.modifiers?.length ?? 0) > 0
    || !!item.has_variants
    || (packagingEligible && (item.packaging_options?.length ?? 0) > 1)
  );
}
