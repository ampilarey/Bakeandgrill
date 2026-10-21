import { useCallback, useEffect, useState } from "react";
import type { Item } from "../types";
import { isPackagingEligible, type PosOrderType } from "../orderTypes";
import { itemNeedsConfigure } from "../utils/tileRules";
import type { useCart } from "./useCart";

export type AddToCartOpts = Parameters<ReturnType<typeof useCart>["addToCart"]>[1];

/**
 * What the till was asked to do when it had no order type yet, kept until the
 * cashier has answered the OrderTypeSheet.
 */
export type OrderTypeAsk =
  /** A menu tile or a suggestion chip: add, or open Configure, once the type is known. */
  | { kind: "tap"; item: Item }
  /** A scanned or typed barcode: a straight add. */
  | { kind: "add"; item: Item; opts?: AddToCartOpts }
  /** The phone's folded cart bar: choose, nothing to add. */
  | { kind: "none" };

/**
 * A new ticket has no order type (owner, 2026-10-21: takeaways were charged
 * as dine-in because Dine-in was preselected, with service charge instead of
 * packaging). The first thing that would put an item on the ticket is held
 * here while the OrderTypeSheet asks, and runs once the chosen type has
 * landed in state, so the item is added with that type's packaging rule and
 * the Configure decision is made with it too.
 */
export function useOrderTypeGate(args: {
  orderType: PosOrderType | null;
  addToCart: (item: Item, opts?: AddToCartOpts) => void;
  selectItem: (item: Item) => void;
}) {
  const { orderType, addToCart, selectItem } = args;
  const [ask, setAsk] = useState<OrderTypeAsk | null>(null);
  const [pending, setPending] = useState<OrderTypeAsk | null>(null);

  const run = useCallback((a: OrderTypeAsk, type: PosOrderType) => {
    if (a.kind === "add") {
      addToCart(a.item, a.opts);
    } else if (a.kind === "tap") {
      if (itemNeedsConfigure(a.item, isPackagingEligible(type))) selectItem(a.item);
      else addToCart(a.item);
    }
  }, [addToCart, selectItem]);

  /** A menu tile or chip was tapped. */
  const tapItem = useCallback((item: Item) => {
    if (orderType === null) { setAsk({ kind: "tap", item }); return; }
    run({ kind: "tap", item }, orderType);
  }, [orderType, run]);

  /** A barcode or scan resolved to an item. */
  const addItem = useCallback((item: Item, opts?: AddToCartOpts) => {
    if (orderType === null) { setAsk({ kind: "add", item, opts }); return; }
    addToCart(item, opts);
  }, [orderType, addToCart]);

  /** Open the ask with nothing waiting behind it. */
  const askOnly = useCallback(() => setAsk({ kind: "none" }), []);

  /** The sheet was answered: the caller sets the type; the held tap waits for it. */
  const chosen = useCallback(() => {
    setPending(ask);
    setAsk(null);
  }, [ask]);

  /** The sheet was closed without an answer: the tap is dropped. */
  const cancel = useCallback(() => setAsk(null), []);

  useEffect(() => {
    if (!pending || orderType === null) return;
    run(pending, orderType);
    setPending(null);
  }, [pending, orderType, run]);

  return { ask, tapItem, addItem, askOnly, chosen, cancel };
}
