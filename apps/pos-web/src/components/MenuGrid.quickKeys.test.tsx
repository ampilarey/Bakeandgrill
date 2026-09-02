/**
 * The Quick tab and the Popular-now tab on the till.
 *
 * Owner, 2026-09-02: the POS showed categories and items only in the
 * admin's order, "but usually pos used for dine in customers and certain
 * items are frequent in certain times … each staff on his own". So:
 *
 *   - "★ Quick" is the first pill. It lists the cashier's own pinned items in
 *     their order, or the shared set until they have pinned anything.
 *   - "🔥 Now" lists what sells at this hour, best first, only when the
 *     server sent a ranking.
 *   - Press and hold a tile to add it, move it, or take it off; a menu
 *     manager also sees the shared set. A plain tap still rings it up.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

vi.mock("../hooks/useCart", () => ({
  effectiveItemPrice: (item: Item) => Number(item.base_price),
  originalItemPrice: () => null,
}));

const categories = [
  { id: 1, name: "Food", is_active: true, parent_id: null },
  { id: 2, name: "Drinks", is_active: true, parent_id: null },
];

function item(id: number, name: string, category_id: number): Item {
  return { id, name, base_price: 10, category_id, is_available: true, has_variants: false, modifiers: [] } as unknown as Item;
}

const bajiya = item(10, "Bajiya", 1);
const gulha = item(11, "Gulha", 1);
const tea = item(20, "Black Tea", 2);
const coffee = item(21, "Coffee", 2);
const items = [bajiya, gulha, tea, coffee];

function renderGrid(over: Record<string, unknown> = {}) {
  const addToCart = vi.fn();
  const onUpdateQuickKeys = vi.fn();
  render(
    <MenuGrid
      {...({
        categories,
        selectedCategoryId: null,
        setSelectedCategoryId: () => {},
        filteredItems: items,
        isLoading: false,
        dataError: "",
        selectedItem: null,
        selectedModifiers: [],
        handleSelectItem: () => {},
        toggleModifier: () => {},
        addToCart,
        clearSelectedItem: () => {},
        barcode: "",
        setBarcode: () => {},
        onBarcodeSubmit: (e: React.FormEvent) => e.preventDefault(),
        orderType: "Dine-in",
        quickKeys: { shared: [tea.id], mine: [] },
        canManageSharedQuickKeys: false,
        onUpdateQuickKeys,
        popularNow: [],
        ...over,
      } as never)}
    />,
  );
  return { addToCart, onUpdateQuickKeys };
}

const pill = (name: RegExp) => screen.getByRole("button", { name });
const tileNames = () =>
  Array.from(document.querySelectorAll(".pos-menu-grid button")).map((b) => (b.textContent || "").replace(/MVR.*$/, "").replace("★", "").trim());

function hold(el: Element) {
  fireEvent.pointerDown(el, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.pointerUp(el);
  fireEvent.click(el);
}

describe("Quick tab", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is the first pill and falls back to the shared set until the cashier has one", () => {
    renderGrid();

    const pills = screen.getAllByRole("button").map((b) => b.textContent);
    expect(pills[0]).toBe("★ Quick (1)");

    fireEvent.click(pill(/Quick/));
    expect(tileNames()).toEqual(["Black Tea"]);
  });

  it("shows the cashier's own set, in their order, once they have one", () => {
    renderGrid({ quickKeys: { shared: [tea.id], mine: [coffee.id, bajiya.id] } });

    fireEvent.click(pill(/Quick/));
    expect(tileNames()).toEqual(["Coffee", "Bajiya"]);
  });

  it("explains itself when empty", () => {
    renderGrid({ quickKeys: { shared: [], mine: [] } });

    fireEvent.click(pill(/Quick/));
    expect(screen.getByTestId("quick-empty")).toHaveTextContent("Press and hold any item");
  });

  it("a hold on a tile offers to add it; a tap still rings it up", () => {
    const { addToCart, onUpdateQuickKeys } = renderGrid();

    const tile = screen.getByRole("button", { name: /Bajiya/ });
    fireEvent.click(tile);
    expect(addToCart).toHaveBeenCalledTimes(1);

    hold(tile);
    // The hold swallowed the click that followed it.
    expect(addToCart).toHaveBeenCalledTimes(1);

    const prompt = screen.getByTestId("quick-key-prompt");
    fireEvent.click(within(prompt).getByRole("button", { name: "Add to my Quick keys" }));

    expect(onUpdateQuickKeys).toHaveBeenCalledWith("mine", [bajiya.id]);
    expect(screen.queryByTestId("quick-key-prompt")).toBeNull();
  });

  it("a hold on a pinned tile offers move and remove, and marks it with a star", () => {
    const { onUpdateQuickKeys } = renderGrid({ quickKeys: { shared: [], mine: [coffee.id, bajiya.id, tea.id] } });

    const tile = screen.getByRole("button", { name: /Bajiya/ });
    expect(tile).toHaveAttribute("data-pinned", "true");
    expect(screen.getByRole("button", { name: /Gulha/ })).not.toHaveAttribute("data-pinned");

    hold(tile);
    const prompt = screen.getByTestId("quick-key-prompt");
    expect(within(prompt).getByRole("button", { name: "Move earlier in my Quick keys" })).toBeInTheDocument();
    expect(within(prompt).getByRole("button", { name: "Move later in my Quick keys" })).toBeInTheDocument();
    // Not a manager: nothing about the shared set.
    expect(within(prompt).queryByRole("button", { name: /shared/ })).toBeNull();

    fireEvent.click(within(prompt).getByRole("button", { name: "Move earlier in my Quick keys" }));
    expect(onUpdateQuickKeys).toHaveBeenCalledWith("mine", [bajiya.id, coffee.id, tea.id]);
  });

  it("lets a menu manager pin to the shared set as well", () => {
    const { onUpdateQuickKeys } = renderGrid({ canManageSharedQuickKeys: true, quickKeys: { shared: [tea.id], mine: [] } });

    hold(screen.getByRole("button", { name: /Gulha/ }));
    const prompt = screen.getByTestId("quick-key-prompt");
    fireEvent.click(within(prompt).getByRole("button", { name: "Add to the shared Quick keys" }));

    expect(onUpdateQuickKeys).toHaveBeenCalledWith("shared", [tea.id, gulha.id]);
  });

  it("does not offer a hold when the till has no keys feature", () => {
    const { addToCart } = renderGrid({ quickKeys: undefined, onUpdateQuickKeys: undefined });

    expect(screen.queryByRole("button", { name: /Quick/ })).toBeNull();
    const tile = screen.getByRole("button", { name: /Bajiya/ });
    hold(tile);
    expect(screen.queryByTestId("quick-key-prompt")).toBeNull();
    // Without the hold wiring, the click goes straight through.
    expect(addToCart).toHaveBeenCalled();
  });
});

describe("Popular-now tab", () => {
  it("appears only with a ranking, and keeps the server's order", () => {
    renderGrid({ popularNow: [] });
    expect(screen.queryByRole("button", { name: /Now/ })).toBeNull();
  });

  it("lists what sells at this hour, best first, skipping anything not on this menu", () => {
    renderGrid({ popularNow: [coffee.id, 999, bajiya.id] });

    fireEvent.click(pill(/🔥 Now \(2\)/));
    expect(tileNames()).toEqual(["Coffee", "Bajiya"]);
  });
});
