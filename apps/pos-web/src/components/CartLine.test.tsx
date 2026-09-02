/**
 * One line on the ticket. Owner, 2026-09-02: "tap the row to +, but dont
 * expand". What has to stay true:
 *
 *   - a tap anywhere on the row adds one, the way tapping the tile does
 *   - the pill and the note chip do their own thing without also adding one
 *   - a tap while the red Delete strip is showing only closes the strip
 *   - − at quantity 1 removes the line and offers undo
 *   - a resumed ticket ignores the tap
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CartItem } from "../types";
import { makeCartKey } from "../hooks/useCart";
import { CartLine } from "./OrderCart";

const water: CartItem = { id: 7, name: "Water", price: 5, quantity: 2, modifiers: [] };
const tea: CartItem = { id: 8, name: "Tea", price: 10, quantity: 1, modifiers: [] };
const key = (i: CartItem) => makeCartKey(i.id, i.modifiers, i.variant_id, i.notes, i.packaging_option_id);

function renderLine(item: CartItem, over: Partial<React.ComponentProps<typeof CartLine>> = {}) {
  const setCartItems = vi.fn();
  const onLineRemoved = vi.fn();
  const onOpenNotePicker = vi.fn();
  render(
    <CartLine
      item={item}
      cartItems={[water, tea]}
      setCartItems={setCartItems}
      quickNotes={["No sugar"]}
      onOpenNotePicker={onOpenNotePicker}
      isResumed={false}
      onLineRemoved={onLineRemoved}
      {...over}
    />,
  );
  return { setCartItems, onLineRemoved, onOpenNotePicker, row: screen.getByTestId(`cart-line-${key(item)}`) };
}

describe("CartLine", () => {
  it("adds one when the row is tapped", () => {
    const { setCartItems, row } = renderLine(water);
    fireEvent.click(row);
    expect(setCartItems).toHaveBeenCalledWith([{ ...water, quantity: 3 }, tea]);
  });

  it("the pill and the note chip do not also add one through the row", () => {
    const { setCartItems, onOpenNotePicker } = renderLine(water);

    fireEvent.click(screen.getByRole("button", { name: "Decrease quantity Water" }));
    expect(setCartItems).toHaveBeenCalledTimes(1);
    expect(setCartItems).toHaveBeenCalledWith([{ ...water, quantity: 1 }, tea]);

    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(onOpenNotePicker).toHaveBeenCalledWith(key(water));
    expect(setCartItems).toHaveBeenCalledTimes(1);
  });

  it("a tap while Delete is showing closes the strip instead of adding", () => {
    const { setCartItems, row } = renderLine(water);

    fireEvent.touchStart(row, { touches: [{ clientX: 300 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 180 }] });
    fireEvent.touchEnd(row);
    expect(screen.getByRole("button", { name: "Delete item" })).toBeInTheDocument();

    fireEvent.click(row);
    expect(setCartItems).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Delete item" })).toBeNull();

    fireEvent.click(row);
    expect(setCartItems).toHaveBeenCalledWith([{ ...water, quantity: 3 }, tea]);
  });

  it("− at one takes the line off and offers undo", () => {
    const { setCartItems, onLineRemoved } = renderLine(tea);
    fireEvent.click(screen.getByRole("button", { name: "Decrease quantity Tea" }));
    expect(setCartItems).toHaveBeenCalledWith([water]);
    expect(onLineRemoved).toHaveBeenCalledWith(tea);
  });

  it("ignores the tap on a resumed ticket", () => {
    const { setCartItems, row } = renderLine(water, { isResumed: true });
    fireEvent.click(row);
    expect(setCartItems).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Increase quantity Water" })).toBeDisabled();
  });
});
