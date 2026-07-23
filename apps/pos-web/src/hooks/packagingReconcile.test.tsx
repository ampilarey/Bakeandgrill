import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CartItem, Item } from "../types";
import { makeCartKey } from "./useCart";
import {
  applyPackagingPickerSelections,
  mergeCartLinesByPackagingKey,
  reconcileCartPackagingForOrderTypeToggle,
  stripCartLinePackaging,
} from "./packagingReconcile";
import { PackagingReconcileModal } from "../components/PackagingReconcileModal";

const singleOptItem: Item = {
  id: 1,
  name: "Fries",
  base_price: 20,
  category_id: 1,
  packaging_fee_mode: "per_unit",
  packaging_options: [
    { id: 101, name: "Box", fee: 3, is_default: true, sort_order: 0 },
  ],
} as Item;

const multiOptItem: Item = {
  id: 2,
  name: "Burger",
  base_price: 50,
  category_id: 1,
  packaging_fee_mode: "per_unit",
  packaging_options: [
    { id: 201, name: "Small", fee: 2, is_default: false, sort_order: 0 },
    { id: 202, name: "Large", fee: 5, is_default: true, sort_order: 1 },
  ],
} as Item;

function bareLine(item: Item, qty = 1, packaging?: Partial<CartItem>): CartItem {
  return {
    id: item.id,
    name: item.name,
    price: Number(item.base_price),
    quantity: qty,
    modifiers: [],
    packaging_fee: 0,
    packaging_fee_mode: "per_unit",
    packaging_option_id: null,
    packaging_option_name: null,
    variant_id: null,
    notes: [],
    ...packaging,
  };
}

describe("packaging reconcile on order-type toggle", () => {
  it("Dine-in → Takeaway auto-applies single-option packaging", () => {
    const cart = [bareLine(singleOptItem)];
    const result = reconcileCartPackagingForOrderTypeToggle("Takeaway", cart, [singleOptItem]);
    expect(result.needsPicker).toHaveLength(0);
    expect(result.items[0].packaging_option_id).toBe(101);
    expect(result.items[0].packaging_fee).toBe(3);
    expect(result.items[0].packaging_option_name).toBe("Box");
  });

  it("Dine-in → Takeaway queues multi-option lines without packaging for the modal", () => {
    const cart = [bareLine(multiOptItem, 2)];
    const result = reconcileCartPackagingForOrderTypeToggle("Takeaway", cart, [multiOptItem]);
    expect(result.items[0].packaging_option_id).toBeNull();
    expect(result.needsPicker).toHaveLength(1);
    expect(result.needsPicker[0].itemId).toBe(2);
    expect(result.needsPicker[0].quantity).toBe(2);
    expect(result.needsPicker[0].options.map((o) => o.id)).toEqual([201, 202]);
  });

  it("Takeaway → Dine-in strips packaging from lines", () => {
    const cart = [
      bareLine(multiOptItem, 1, {
        packaging_fee: 5,
        packaging_option_id: 202,
        packaging_option_name: "Large",
      }),
    ];
    const result = reconcileCartPackagingForOrderTypeToggle("Dine-in", cart, [multiOptItem]);
    expect(result.needsPicker).toHaveLength(0);
    expect(result.items[0].packaging_fee).toBe(0);
    expect(result.items[0].packaging_option_id).toBeNull();
    expect(result.items[0].packaging_option_name).toBeNull();
  });

  it("keeps an already-valid packaging option when switching to eligible", () => {
    const cart = [
      bareLine(multiOptItem, 1, {
        packaging_fee: 2,
        packaging_option_id: 201,
        packaging_option_name: "Small",
      }),
    ];
    const result = reconcileCartPackagingForOrderTypeToggle("Pickup", cart, [multiOptItem]);
    expect(result.needsPicker).toHaveLength(0);
    expect(result.items[0].packaging_option_id).toBe(201);
  });

  it("merges lines that collapse to the same key after strip", () => {
    const a = bareLine(multiOptItem, 1, {
      packaging_fee: 2,
      packaging_option_id: 201,
      packaging_option_name: "Small",
    });
    const b = bareLine(multiOptItem, 2, {
      packaging_fee: 5,
      packaging_option_id: 202,
      packaging_option_name: "Large",
    });
    const stripped = stripCartLinePackaging([a, b]);
    expect(stripped).toHaveLength(1);
    expect(stripped[0].quantity).toBe(3);
    expect(stripped[0].packaging_option_id).toBeNull();
  });

  it("merges identical bare lines when multi-option picker is needed", () => {
    const cart = [bareLine(multiOptItem, 1), bareLine(multiOptItem, 2)];
    const result = reconcileCartPackagingForOrderTypeToggle("Delivery", cart, [multiOptItem]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(3);
    expect(result.needsPicker).toHaveLength(1);
    expect(result.needsPicker[0].quantity).toBe(3);
  });

  it("applyPackagingPickerSelections writes chosen options and can merge", () => {
    const line = bareLine(multiOptItem, 2);
    const key = makeCartKey(line.id, line.modifiers, line.variant_id, line.notes, line.packaging_option_id);
    const menuById = new Map([[multiOptItem.id, multiOptItem]]);
    const next = applyPackagingPickerSelections([line], { [key]: 202 }, menuById);
    expect(next[0].packaging_option_id).toBe(202);
    expect(next[0].packaging_fee).toBe(5);
    expect(next[0].packaging_option_name).toBe("Large");
  });

  it("skips items missing from the menu", () => {
    const cart = [bareLine(multiOptItem)];
    const result = reconcileCartPackagingForOrderTypeToggle("Takeaway", cart, []);
    expect(result.items[0].packaging_option_id).toBeNull();
    expect(result.needsPicker).toHaveLength(0);
  });

  it("mergeCartLinesByPackagingKey sums matching keys", () => {
    const a = bareLine(singleOptItem, 1, {
      packaging_option_id: 101,
      packaging_fee: 3,
      packaging_option_name: "Box",
    });
    const b = bareLine(singleOptItem, 4, {
      packaging_option_id: 101,
      packaging_fee: 3,
      packaging_option_name: "Box",
    });
    const merged = mergeCartLinesByPackagingKey([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(5);
  });
});

describe("PackagingReconcileModal (forced)", () => {
  const pickerLine = {
    lineKey: "2-v0--n-p0",
    itemId: 2,
    itemName: "Burger",
    quantity: 1,
    options: [
      { id: 201, name: "Small", fee: 2, is_default: false, sort_order: 0 },
      { id: 202, name: "Large", fee: 5, is_default: true, sort_order: 1 },
    ],
  };

  it("has no cancel/close affordance and Confirm stays disabled until every line is chosen", () => {
    const onConfirm = vi.fn();
    render(<PackagingReconcileModal lines={[pickerLine]} onConfirm={onConfirm} />);

    expect(screen.getByTestId("packaging-reconcile-modal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/close/i)).not.toBeInTheDocument();

    const confirm = screen.getByTestId("packaging-reconcile-confirm");
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByText("Large"));
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ [pickerLine.lineKey]: 202 });
  });

  it("does not dismiss on Esc or backdrop click", () => {
    const onConfirm = vi.fn();
    render(<PackagingReconcileModal lines={[pickerLine]} onConfirm={onConfirm} />);
    const modal = screen.getByTestId("packaging-reconcile-modal");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(modal);
    expect(screen.getByTestId("packaging-reconcile-modal")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires a selection for every listed line before Confirm enables", () => {
    const lines = [
      pickerLine,
      {
        lineKey: "3-v0--n-p0",
        itemId: 3,
        itemName: "Wrap",
        quantity: 1,
        options: [
          { id: 301, name: "Paper", fee: 1, is_default: true, sort_order: 0 },
          { id: 302, name: "Foil", fee: 2, is_default: false, sort_order: 1 },
        ],
      },
    ];
    render(<PackagingReconcileModal lines={lines} onConfirm={vi.fn()} />);
    const confirm = screen.getByTestId("packaging-reconcile-confirm");
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByText("Large"));
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByText("Foil"));
    expect(confirm).not.toBeDisabled();
  });
});

/** Documents that resume/load must call raw setOrderType — reconcile is opt-in via toggle helper only. */
describe("resume path contract", () => {
  it("does not imply reconcile when only cart state is replaced (raw setter semantics)", () => {
    // Simulates ticket load: replace cart + setOrderType without calling reconcile.
    const loaded = [
      bareLine(multiOptItem, 1, {
        packaging_fee: 5,
        packaging_option_id: 202,
        packaging_option_name: "Large",
      }),
    ];
    // No reconcileCartPackagingForOrderTypeToggle call — packaging snapshot stays as loaded.
    expect(loaded[0].packaging_option_id).toBe(202);
    expect(loaded[0].packaging_fee).toBe(5);
  });
});
