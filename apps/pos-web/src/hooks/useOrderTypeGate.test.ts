/**
 * The first item of a ticket with no order type waits for the OrderTypeSheet
 * (owner, 2026-10-21), then runs with the chosen type's rules.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useOrderTypeGate } from "./useOrderTypeGate";
import type { Item } from "../types";
import type { PosOrderType } from "../orderTypes";

const plain = { id: 1, name: "Iced Coffee", has_variants: false, modifiers: [], packaging_options: [] } as unknown as Item;
const boxed = {
  id: 2, name: "Chicken Burger", has_variants: false, modifiers: [],
  packaging_options: [{ id: 1, name: "Box" }, { id: 2, name: "Bag" }],
} as unknown as Item;

function setup(orderType: PosOrderType | null) {
  const addToCart = vi.fn();
  const selectItem = vi.fn();
  const hook = renderHook(
    ({ type }: { type: PosOrderType | null }) => useOrderTypeGate({ orderType: type, addToCart, selectItem }),
    { initialProps: { type: orderType } },
  );
  return { addToCart, selectItem, ...hook };
}

describe("useOrderTypeGate", () => {
  it("adds straight away once a type is chosen", () => {
    const { result, addToCart } = setup("Takeaway");
    act(() => result.current.tapItem(plain));
    expect(addToCart).toHaveBeenCalledWith(plain);
    expect(result.current.ask).toBeNull();
  });

  it("holds the first tap of a ticket with no type until the sheet is answered", () => {
    const { result, addToCart, rerender } = setup(null);
    act(() => result.current.tapItem(plain));
    expect(addToCart).not.toHaveBeenCalled();
    expect(result.current.ask).toEqual({ kind: "tap", item: plain });

    act(() => result.current.chosen());
    expect(result.current.ask).toBeNull();
    // The caller sets the type; the add runs once it has landed, once.
    expect(addToCart).not.toHaveBeenCalled();
    rerender({ type: "Takeaway" });
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(plain);
    rerender({ type: "Takeaway" });
    expect(addToCart).toHaveBeenCalledTimes(1);
  });

  it("opens Configure for a packaging choice only on a type that charges packaging", () => {
    const a = setup(null);
    act(() => a.result.current.tapItem(boxed));
    act(() => a.result.current.chosen());
    a.rerender({ type: "Takeaway" });
    expect(a.selectItem).toHaveBeenCalledWith(boxed);
    expect(a.addToCart).not.toHaveBeenCalled();

    const b = setup(null);
    act(() => b.result.current.tapItem(boxed));
    act(() => b.result.current.chosen());
    b.rerender({ type: "Dine-in" });
    expect(b.addToCart).toHaveBeenCalledWith(boxed);
    expect(b.selectItem).not.toHaveBeenCalled();
  });

  it("drops the tap when the sheet is closed without an answer", () => {
    const { result, addToCart, rerender } = setup(null);
    act(() => result.current.tapItem(plain));
    act(() => result.current.cancel());
    expect(result.current.ask).toBeNull();
    rerender({ type: "Takeaway" });
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("keeps a scan's variant through the ask", () => {
    const { result, addToCart, rerender } = setup(null);
    const variant = { id: 9 } as never;
    act(() => result.current.addItem(plain, { variant }));
    expect(result.current.ask).toEqual({ kind: "add", item: plain, opts: { variant } });
    act(() => result.current.chosen());
    rerender({ type: "Dine-in" });
    expect(addToCart).toHaveBeenCalledWith(plain, { variant });
  });

  it("can ask with nothing waiting behind it (the phone's folded cart bar)", () => {
    const { result, addToCart, selectItem, rerender } = setup(null);
    act(() => result.current.askOnly());
    expect(result.current.ask).toEqual({ kind: "none" });
    act(() => result.current.chosen());
    rerender({ type: "Dine-in" });
    expect(addToCart).not.toHaveBeenCalled();
    expect(selectItem).not.toHaveBeenCalled();
  });
});
