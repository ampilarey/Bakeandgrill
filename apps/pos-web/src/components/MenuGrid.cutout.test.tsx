import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

/* Owner, 2026-10-01: a tile shows the cut-out on its own colour, with no
   circle ("Pos should render without circle. Circle is for both menu
   page"); without a cut-out it keeps the photo. */

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
  it("shows the cut-out without a circle and leaves the photo tile alone", () => {
    const items: Item[] = [
      {
        id: 1, name: "Da Hong Pao", base_price: 45, category_id: 1, is_available: true, has_variants: false,
        image_url: "/storage/menu/cup.jpg",
        cutout_url: "/storage/menu-cutouts/cup.png",
      },
      {
        id: 2, name: "Croissant", base_price: 15, category_id: 1, is_available: true, has_variants: false,
        image_url: "/storage/menu/croissant.jpg",
      },
    ];

    render(<MenuGrid {...baseProps} filteredItems={items} />);

    const tile = screen.getByTestId("pos-tile-cutout");
    expect(tile.querySelector("img")).toHaveAttribute("src", "/storage/menu-cutouts/cup.png");
    // One element only: the image. No circle is drawn on the POS.
    expect(tile.children).toHaveLength(1);
    expect(tile.firstElementChild?.tagName).toBe("IMG");
    // In the tile's column above the name, not layered under it, so a
    // two-line name shrinks the picture instead of overlapping it.
    expect(tile.style.flexGrow).toBe("1");
    expect(tile.style.flexBasis).toBe("0px");
    expect(tile.style.minHeight).toBe("0px");
    expect(tile.getAttribute("style")).not.toMatch(/inset/);
    expect(tile.nextElementSibling).toHaveTextContent("Da Hong Pao");
    expect(screen.getAllByTestId("pos-tile-cutout")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Croissant/ }).querySelector("img")).toHaveAttribute("src", "/storage/menu/croissant.jpg");
  });
});
