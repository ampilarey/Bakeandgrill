import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

vi.mock("../hooks/useCart", () => ({
  effectiveItemPrice: (item: Item) => Number(item.base_price),
  originalItemPrice: () => null,
}));

/**
 * Sizes of one dish share one pool of ingredients and draw on it at different
 * rates, so they sell out at different moments. Owner, 2026-09-01: "Offer full
 * until the last possible piece" — the full is never withdrawn early to keep
 * halves in reserve; it simply goes first once less than a whole piece is left.
 */
const item: Item = {
  id: 1,
  name: "Beetle leaf",
  base_price: 20,
  category_id: 1,
  is_available: true,
  has_variants: true,
  availability: { available: true, available_stock: 1 },
  variants: [
    { id: 10, name: "Full", price: 20, is_active: true, sort_order: 0, is_available: false, available_stock: 0 },
    { id: 11, name: "Half", price: 12, is_active: true, sort_order: 1, is_available: true, available_stock: 1 },
  ],
};

const baseProps = {
  categories: [{ id: 1, name: "Grill", is_active: true }],
  selectedCategoryId: null as number | null,
  setSelectedCategoryId: () => {},
  isLoading: false,
  dataError: "",
  selectedModifiers: [],
  handleSelectItem: () => {},
  toggleModifier: () => {},
  clearSelectedItem: () => {},
  barcode: "",
  setBarcode: () => {},
  onBarcodeSubmit: (e: React.FormEvent) => e.preventDefault(),
  orderType: "dine_in" as const,
  filteredItems: [item],
};

describe("MenuGrid variant stock", () => {
  it("marks a size the ingredient pool can no longer cover as sold out", () => {
    render(<MenuGrid {...baseProps} selectedItem={item} addToCart={() => {}} />);

    const full = screen.getByRole("button", { name: /Full/ });
    expect(full).toBeDisabled();
    expect(full).toHaveTextContent("Sold out");

    const half = screen.getByRole("button", { name: /Half/ });
    expect(half).toBeEnabled();
    expect(half).toHaveTextContent("MVR 12.00");
  });

  it("does not add a sold-out size to the ticket when tapped", async () => {
    const addToCart = vi.fn();
    render(<MenuGrid {...baseProps} selectedItem={item} addToCart={addToCart} />);

    await userEvent.click(screen.getByRole("button", { name: /Full/ }));

    expect(addToCart).not.toHaveBeenCalled();
  });

  it("adds the size that is still makeable", async () => {
    const addToCart = vi.fn();
    render(<MenuGrid {...baseProps} selectedItem={item} addToCart={addToCart} />);

    await userEvent.click(screen.getByRole("button", { name: /Half/ }));

    expect(addToCart).toHaveBeenCalledWith(
      item,
      expect.objectContaining({ variant: expect.objectContaining({ id: 11 }) }),
    );
  });

  it("leaves sizes alone when the pool does not cap this dish", () => {
    const uncapped: Item = {
      ...item,
      variants: [
        { id: 10, name: "Full", price: 20, is_active: true, sort_order: 0 },
        { id: 11, name: "Half", price: 12, is_active: true, sort_order: 1 },
      ],
    };

    render(<MenuGrid {...baseProps} filteredItems={[uncapped]} selectedItem={uncapped} addToCart={() => {}} />);

    expect(screen.getByRole("button", { name: /Full/ })).toBeEnabled();
    expect(screen.queryByText("Sold out")).toBeNull();
  });
});
