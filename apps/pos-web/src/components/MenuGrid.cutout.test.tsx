import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

/* Owner, 2026-10-01, with the ZUS screenshots: a tile floats the cut-out
   over a circle; without one it keeps the photo. */

vi.mock("../hooks/useCart", () => ({
  effectiveItemPrice: (item: Item) => Number(item.base_price),
  originalItemPrice: () => null,
}));

const baseProps = {
  categories: [{ id: 1, name: "Drinks", is_active: true }],
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

describe("MenuGrid cut-out tiles", () => {
  it("draws the cut-out over its circle and leaves the photo tile alone", () => {
    const items: Item[] = [
      {
        id: 1, name: "Da Hong Pao", base_price: 45, category_id: 1, is_available: true, has_variants: false,
        image_url: "/storage/menu/cup.jpg",
        cutout_url: "/storage/menu-cutouts/cup.png",
        cutout_backdrop: { color: "#FFEEDD", strength: 40, source: "category" },
      },
      {
        id: 2, name: "Croissant", base_price: 15, category_id: 1, is_available: true, has_variants: false,
        image_url: "/storage/menu/croissant.jpg",
      },
    ];

    render(<MenuGrid {...baseProps} filteredItems={items} />);

    const tile = screen.getByTestId("pos-tile-cutout");
    expect(tile.dataset.color).toBe("#FFEEDD");
    expect(tile.dataset.alpha).toBe("0.40");
    expect(tile.querySelector("img")).toHaveAttribute("src", "/storage/menu-cutouts/cup.png");
    expect(screen.getAllByTestId("pos-tile-cutout")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Croissant/ }).querySelector("img")).toHaveAttribute("src", "/storage/menu/croissant.jpg");
  });
});
