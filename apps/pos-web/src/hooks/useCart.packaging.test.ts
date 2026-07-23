import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { makeCartKey, resolvePackagingSnapshot, useCart } from "./useCart";
import { isPackagingEligible } from "../orderTypes";
import type { Item } from "../types";

const itemWithPackaging: Item = {
  id: 1,
  name: "Burger",
  base_price: 50,
  category_id: 1,
  is_available: true,
  has_variants: false,
  packaging_fee: 1,
  packaging_fee_mode: "per_unit",
  packaging_options: [
    { id: 10, name: "Small", fee: 2, is_default: false, sort_order: 0 },
    { id: 11, name: "Large", fee: 5, is_default: true, sort_order: 1 },
  ],
} as Item;

describe("resolvePackagingSnapshot", () => {
  it("uses default packaging option when present", () => {
    const snap = resolvePackagingSnapshot(
      {
        packaging_fee: 1,
        packaging_fee_mode: "per_unit",
        packaging_options: [
          { id: 10, name: "Small", fee: 2, is_default: false, sort_order: 0 },
          { id: 11, name: "Large", fee: 5, is_default: true, sort_order: 1 },
        ],
      },
      null,
    );
    expect(snap.packaging_option_id).toBe(11);
    expect(snap.packaging_fee).toBe(5);
    expect(snap.packaging_option_name).toBe("Large");
  });

  it("falls back to legacy packaging_fee", () => {
    const snap = resolvePackagingSnapshot(
      { packaging_fee: 3.5, packaging_fee_mode: "per_line", packaging_options: [] },
      null,
    );
    expect(snap.packaging_option_id).toBeNull();
    expect(snap.packaging_fee).toBe(3.5);
    expect(snap.packaging_fee_mode).toBe("per_line");
  });
});

describe("makeCartKey packaging", () => {
  it("keeps different packaging options as separate lines", () => {
    const a = makeCartKey(1, [], null, [], 10);
    const b = makeCartKey(1, [], null, [], 11);
    expect(a).not.toBe(b);
  });
});

describe("isPackagingEligible", () => {
  it("is false for dine-in (UI label and backend slug)", () => {
    expect(isPackagingEligible("Dine-in")).toBe(false);
    expect(isPackagingEligible("dine_in")).toBe(false);
  });

  it("is true for Takeaway / Pickup / Delivery / catering", () => {
    expect(isPackagingEligible("Takeaway")).toBe(true);
    expect(isPackagingEligible("Pickup")).toBe(true);
    expect(isPackagingEligible("Delivery")).toBe(true);
    expect(isPackagingEligible("catering")).toBe(true);
    expect(isPackagingEligible("takeaway")).toBe(true);
    expect(isPackagingEligible("online_pickup")).toBe(true);
    expect(isPackagingEligible("delivery")).toBe(true);
  });
});

describe("useCart packaging by order type", () => {
  it("attaches no packaging option or fee for Dine-in adds", () => {
    const { result } = renderHook(() => useCart("Dine-in"));
    act(() => {
      result.current.addToCart(itemWithPackaging);
    });
    expect(result.current.cartItems).toHaveLength(1);
    expect(result.current.cartItems[0].packaging_option_id).toBeNull();
    expect(result.current.cartItems[0].packaging_option_name).toBeNull();
    expect(result.current.cartItems[0].packaging_fee).toBe(0);
  });

  it("still resolves default packaging for Takeaway", () => {
    const { result } = renderHook(() => useCart("Takeaway"));
    act(() => {
      result.current.addToCart(itemWithPackaging);
    });
    expect(result.current.cartItems[0].packaging_option_id).toBe(11);
    expect(result.current.cartItems[0].packaging_fee).toBe(5);
  });

  it("still resolves packaging for Pickup and Delivery", () => {
    for (const type of ["Pickup", "Delivery"] as const) {
      const { result } = renderHook(() => useCart(type));
      act(() => {
        result.current.addToCart(itemWithPackaging);
      });
      expect(result.current.cartItems[0].packaging_option_id).toBe(11);
      expect(result.current.cartItems[0].packaging_fee).toBe(5);
    }
  });
});
