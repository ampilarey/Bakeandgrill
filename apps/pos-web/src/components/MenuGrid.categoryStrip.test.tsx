/**
 * The POS category strip is two rows, not one.
 *
 * Owner, 2026-08-18: "i have category and subcategory, but still in pos they
 * are in same line." The cause was upstream — PosMenuBuilder was not selecting
 * parent_id, so every category reached the till looking top-level — but the
 * strip itself had no test at all, so nothing described what it is supposed to
 * draw. These pin the shape:
 *
 *   Row 1  every TOP-LEVEL category, with a caret on those that have children
 *   Row 2  the selected parent's children, only once a parent is selected
 *
 * The matching payload guard is backend/tests/Feature/PosMenuTest.php —
 * test_pos_menu_carries_the_category_nesting. Both are needed: this file would
 * have passed happily throughout the bug, because the components were right
 * and it was the data that arrived flattened.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

vi.mock("../hooks/useCart", () => ({
  effectiveItemPrice: (item: Item) => Number(item.base_price),
  originalItemPrice: () => null,
}));

/** Food → Shorteats, Fast food.  Drinks → Hot Drinks.  Merch has no children. */
const categories = [
  { id: 1, name: "Food", is_active: true, parent_id: null },
  { id: 2, name: "Shorteats", is_active: true, parent_id: 1 },
  { id: 3, name: "Fast food", is_active: true, parent_id: 1 },
  { id: 4, name: "Drinks", is_active: true, parent_id: null },
  { id: 5, name: "Hot Drinks", is_active: true, parent_id: 4 },
  { id: 6, name: "Merch", is_active: true, parent_id: null },
];

const baseProps = {
  categories,
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

/** Pill captions, caret stripped, in render order. */
function pillLabels(): string[] {
  return screen
    .getAllByRole("button")
    .map((b) => (b.textContent || "").replace("▾", "").trim())
    .filter(Boolean);
}

function renderGrid(selectedCategoryId: number | null) {
  return render(
    <MenuGrid
      {...(baseProps as never)}
      selectedCategoryId={selectedCategoryId}
      filteredItems={[]}
    />,
  );
}

describe("POS category strip", () => {
  it("puts only top-level categories in the first row", () => {
    renderGrid(null);
    const labels = pillLabels();

    expect(labels).toContain("Food");
    expect(labels).toContain("Drinks");
    expect(labels).toContain("Merch");

    // The whole complaint: children must not sit beside their parents.
    expect(labels).not.toContain("Shorteats");
    expect(labels).not.toContain("Fast food");
    expect(labels).not.toContain("Hot Drinks");
  });

  it("marks the parents that have children", () => {
    renderGrid(null);
    const caption = (name: string) =>
      screen.getAllByRole("button").find((b) => (b.textContent || "").includes(name))?.textContent ?? "";

    expect(caption("Food")).toContain("▾");
    expect(caption("Drinks")).toContain("▾");
    // Nothing underneath Merch, so no caret promising a second row.
    expect(caption("Merch")).not.toContain("▾");
  });

  it("opens a second row of that parent's children once it is selected", () => {
    renderGrid(1);
    const labels = pillLabels();

    expect(labels).toContain("Shorteats");
    expect(labels).toContain("Fast food");
    // A way back to the whole parent, without leaving the row.
    expect(labels).toContain("All Food");

    // Only the selected parent's children — not the other parent's.
    expect(labels).not.toContain("Hot Drinks");
  });

  it("keeps the second row when a child is the selection", () => {
    // Tapping a child must not collapse the row you tapped it from.
    renderGrid(2);
    const labels = pillLabels();

    expect(labels).toContain("Shorteats");
    expect(labels).toContain("Fast food");
    expect(labels).toContain("All Food");
  });

  it("shows no second row for a parent that has no children", () => {
    renderGrid(6);
    const labels = pillLabels();

    expect(labels).toContain("Merch");
    expect(labels).not.toContain("All Merch");
  });

  it("draws children smaller than their parents", () => {
    // The rows have to look different, or two rows read as one long wrap.
    renderGrid(1);
    const buttons = screen.getAllByRole("button");
    const parent = buttons.find((b) => (b.textContent || "").includes("Food") && !(b.textContent || "").includes("All Food"));
    const child = buttons.find((b) => (b.textContent || "").trim() === "Shorteats");

    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    const parentSize = parseFloat(getComputedStyle(parent!).fontSize);
    const childSize = parseFloat(getComputedStyle(child!).fontSize);
    expect(childSize).toBeLessThan(parentSize);
  });
});
