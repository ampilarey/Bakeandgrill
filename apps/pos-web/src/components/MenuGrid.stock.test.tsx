import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

vi.mock("../hooks/useCart", () => ({
  effectiveItemPrice: (item: Item) => Number(item.base_price),
  originalItemPrice: () => null,
}));

const baseProps = {
  categories: [{ id: 1, name: "Grill", is_active: true }],
  selectedCategoryId: null as number | null,
  setSelectedCategoryId: () => {},
  isLoading: false,
  dataError: "",
  selectedItem: null,
  selectedModifiers: [],
  handleSelectItem: () => {},
  toggleModifier: () => {},
  addToCart: () => {},
  clearSelectedItem: () => {},
  barcode: "",
  setBarcode: () => {},
  onBarcodeSubmit: (e: React.FormEvent) => e.preventDefault(),
  orderType: "dine_in" as const,
};

describe("MenuGrid stock visibility", () => {
  it("shows remaining count on tracked items and hides untracked sentinel", () => {
    const items: Item[] = [
      {
        id: 1,
        name: "Croissant",
        base_price: 15,
        category_id: 1,
        is_available: true,
        has_variants: false,
        availability: { available: true, available_stock: 2 },
      },
      {
        id: 2,
        name: "Burger",
        base_price: 50,
        category_id: 1,
        is_available: true,
        has_variants: false,
        availability: { available: true, available_stock: 9999 },
      },
    ];

    render(<MenuGrid {...baseProps} filteredItems={items} />);
    expect(screen.getByTestId("pos-stock-count")).toHaveTextContent("2 left");
    expect(screen.queryAllByTestId("pos-stock-count")).toHaveLength(1);
  });
});
