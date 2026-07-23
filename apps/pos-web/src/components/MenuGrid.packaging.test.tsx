import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MenuGrid } from "./MenuGrid";
import type { Item } from "../types";

vi.mock("../theme", () => ({
  z: { modalBackdrop: 50 },
  C: {
    panel: "#fff",
    border: "#e2e8f0",
    border2: "#cbd5e1",
    text: "#0f172a",
    muted: "#64748b",
    subtle: "#94a3b8",
  },
}));

const packagingItem: Item = {
  id: 42,
  name: "Wrap",
  base_price: 25,
  category_id: 1,
  is_available: true,
  has_variants: false,
  modifiers: [],
  packaging_fee: 2,
  packaging_fee_mode: "per_unit",
  packaging_options: [
    { id: 1, name: "Paper", fee: 2, is_default: true, sort_order: 0 },
    { id: 2, name: "Box", fee: 5, is_default: false, sort_order: 1 },
  ],
} as Item;

function renderGrid(orderType: "Dine-in" | "Takeaway" | "Pickup" | "Delivery") {
  const addToCart = vi.fn();
  const handleSelectItem = vi.fn();
  render(
    <MenuGrid
      categories={[]}
      selectedCategoryId={null}
      setSelectedCategoryId={() => {}}
      filteredItems={[packagingItem]}
      isLoading={false}
      dataError=""
      selectedItem={null}
      selectedModifiers={[]}
      handleSelectItem={handleSelectItem}
      toggleModifier={() => {}}
      addToCart={addToCart}
      clearSelectedItem={() => {}}
      barcode=""
      setBarcode={() => {}}
      onBarcodeSubmit={() => {}}
      orderType={orderType}
    />,
  );
  return { addToCart, handleSelectItem };
}

describe("MenuGrid packaging by order type", () => {
  it("one-taps dine-in items with packaging options (no configure)", () => {
    const { addToCart, handleSelectItem } = renderGrid("Dine-in");
    fireEvent.click(screen.getByText("Wrap"));
    expect(handleSelectItem).not.toHaveBeenCalled();
    expect(addToCart).toHaveBeenCalledWith(packagingItem);
  });

  it("opens configure for Takeaway when multiple packaging options exist", () => {
    const { addToCart, handleSelectItem } = renderGrid("Takeaway");
    fireEvent.click(screen.getByText("Wrap"));
    expect(handleSelectItem).toHaveBeenCalledWith(packagingItem);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("opens configure for Pickup when packaging choices exist", () => {
    const { handleSelectItem, addToCart } = renderGrid("Pickup");
    fireEvent.click(screen.getByText("Wrap"));
    expect(handleSelectItem).toHaveBeenCalledWith(packagingItem);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("opens configure for Delivery when packaging choices exist", () => {
    const { handleSelectItem, addToCart } = renderGrid("Delivery");
    fireEvent.click(screen.getByText("Wrap"));
    expect(handleSelectItem).toHaveBeenCalledWith(packagingItem);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("hides Packaging section in configure for Dine-in", () => {
    const addToCart = vi.fn();
    render(
      <MenuGrid
        categories={[]}
        selectedCategoryId={null}
        setSelectedCategoryId={() => {}}
        filteredItems={[packagingItem]}
        isLoading={false}
        dataError=""
        selectedItem={{
          ...packagingItem,
          modifiers: [{ id: 9, name: "Extra sauce", price: 1 } as never],
        }}
        selectedModifiers={[]}
        handleSelectItem={() => {}}
        toggleModifier={() => {}}
        addToCart={addToCart}
        clearSelectedItem={() => {}}
        barcode=""
        setBarcode={() => {}}
        onBarcodeSubmit={() => {}}
        orderType="Dine-in"
      />,
    );
    expect(screen.getByRole("dialog", { name: /Configure Wrap/i })).toBeInTheDocument();
    expect(screen.queryByText("Packaging")).not.toBeInTheDocument();
    expect(screen.getByText("Modifiers")).toBeInTheDocument();
  });

  it("shows Packaging section in configure for Takeaway", () => {
    render(
      <MenuGrid
        categories={[]}
        selectedCategoryId={null}
        setSelectedCategoryId={() => {}}
        filteredItems={[packagingItem]}
        isLoading={false}
        dataError=""
        selectedItem={packagingItem}
        selectedModifiers={[]}
        handleSelectItem={() => {}}
        toggleModifier={() => {}}
        addToCart={vi.fn()}
        clearSelectedItem={() => {}}
        barcode=""
        setBarcode={() => {}}
        onBarcodeSubmit={() => {}}
        orderType="Takeaway"
      />,
    );
    expect(screen.getByText("Packaging")).toBeInTheDocument();
    expect(screen.getByText("Paper")).toBeInTheDocument();
    expect(screen.getByText("Box")).toBeInTheDocument();
  });
});

describe("MenuGrid packaging one-tap configure", () => {
  it("packaging-only item: tapping an option adds immediately (Cancel-only footer)", () => {
    const addToCart = vi.fn();
    const clearSelectedItem = vi.fn();
    render(
      <MenuGrid
        categories={[]}
        selectedCategoryId={null}
        setSelectedCategoryId={() => {}}
        filteredItems={[packagingItem]}
        isLoading={false}
        dataError=""
        selectedItem={packagingItem}
        selectedModifiers={[]}
        handleSelectItem={() => {}}
        toggleModifier={() => {}}
        addToCart={addToCart}
        clearSelectedItem={clearSelectedItem}
        barcode=""
        setBarcode={() => {}}
        onBarcodeSubmit={() => {}}
        orderType="Takeaway"
      />,
    );

    expect(screen.getByText("· tap to add")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add to ticket/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Box"));
    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(packagingItem, {
      variant: undefined,
      packagingOptionId: 2,
    });
    expect(clearSelectedItem).toHaveBeenCalled();
  });

  it("variants + packaging: tapping packaging does not add (two-step)", () => {
    const addToCart = vi.fn();
    const itemWithBoth: Item = {
      ...packagingItem,
      has_variants: true,
      variants: [
        { id: 11, name: "Small", price: 20, is_active: true, sort_order: 0 },
        { id: 12, name: "Large", price: 30, is_active: true, sort_order: 1 },
      ],
    } as Item;

    render(
      <MenuGrid
        categories={[]}
        selectedCategoryId={null}
        setSelectedCategoryId={() => {}}
        filteredItems={[itemWithBoth]}
        isLoading={false}
        dataError=""
        selectedItem={itemWithBoth}
        selectedModifiers={[]}
        handleSelectItem={() => {}}
        toggleModifier={() => {}}
        addToCart={addToCart}
        clearSelectedItem={() => {}}
        barcode=""
        setBarcode={() => {}}
        onBarcodeSubmit={() => {}}
        orderType="Takeaway"
      />,
    );

    expect(screen.queryByText("· tap to add")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to ticket/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Box"));
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("packaging + modifiers: still two-step (no one-tap add)", () => {
    const addToCart = vi.fn();
    const itemWithMods: Item = {
      ...packagingItem,
      modifiers: [{ id: 9, name: "Extra sauce", price: 1 } as never],
    } as Item;

    render(
      <MenuGrid
        categories={[]}
        selectedCategoryId={null}
        setSelectedCategoryId={() => {}}
        filteredItems={[itemWithMods]}
        isLoading={false}
        dataError=""
        selectedItem={itemWithMods}
        selectedModifiers={[]}
        handleSelectItem={() => {}}
        toggleModifier={() => {}}
        addToCart={addToCart}
        clearSelectedItem={() => {}}
        barcode=""
        setBarcode={() => {}}
        onBarcodeSubmit={() => {}}
        orderType="Takeaway"
      />,
    );

    expect(screen.queryByText("· tap to add")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to ticket/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Paper"));
    expect(addToCart).not.toHaveBeenCalled();
  });
});
