import { describe, expect, it } from "vitest";
import {
  cartGrandTotalMvr,
  cartSubtotalFromLines,
  cartTaxExclusiveMvr,
  discountedSubtotalMvr,
  lineUnitPrice,
} from "./posCartTotals";

describe("posCartTotals", () => {
  it("sums line unit prices with modifiers", () => {
    const unit = lineUnitPrice({
      price: 10,
      quantity: 1,
      modifiers: [{ price: 2.5 }, { price: 1.5 }],
    });
    expect(unit).toBe(14);
    expect(
      cartSubtotalFromLines([{ price: 10, quantity: 2, modifiers: [{ price: 5 }] }]),
    ).toBe(30);
  });

  it("allocates stacked discounts without exceeding subtotal", () => {
    const sub = 100;
    const discounted = discountedSubtotalMvr(sub, {
      promo: 4000,
      loyalty: 3000,
      manual: 5000,
    });
    expect(discounted).toBe(0);
  });

  it("computes tax-exclusive GST on discounted base", () => {
    const items = [{ price: 50, quantity: 2, tax_rate: 8 }];
    const sub = cartSubtotalFromLines(items);
    const discounted = discountedSubtotalMvr(sub, { manual: 1000 });
    const tax = cartTaxExclusiveMvr(items, sub, discounted, 8);
    expect(sub).toBe(100);
    expect(discounted).toBe(90);
    expect(tax).toBe(7.2);
    expect(cartGrandTotalMvr(discounted, tax)).toBe(97.2);
  });

  it("treats zero-rated tax_code as non-taxable", () => {
    const items = [{ price: 25, quantity: 1, tax_rate: 8, tax_code: "zero_rated" }];
    const sub = cartSubtotalFromLines(items);
    const tax = cartTaxExclusiveMvr(items, sub, sub, 8);
    expect(tax).toBe(0);
  });

  it("uses settings rate for standard_8 even when legacy tax_rate is corrupt", () => {
    // Real bug: item "zero" had tax_rate=100 while tax_code=standard_8.
    // Server charged 8%; POS showed GST 15.24 on an MVR 18 ticket.
    const items = [
      { price: 1, quantity: 3, tax_rate: 8, tax_code: "standard_8" },
      { price: 5, quantity: 3, tax_rate: 100, tax_code: "standard_8" },
    ];
    const sub = cartSubtotalFromLines(items);
    const tax = cartTaxExclusiveMvr(items, sub, sub, 8);
    expect(sub).toBe(18);
    expect(tax).toBe(1.44);
    expect(cartGrandTotalMvr(sub, tax)).toBe(19.44);
  });

  it("clamps absurd legacy tax_rate without tax_code to settings default", () => {
    const items = [{ price: 5, quantity: 3, tax_rate: 100 }];
    const sub = cartSubtotalFromLines(items);
    const tax = cartTaxExclusiveMvr(items, sub, sub, 8);
    expect(tax).toBe(1.2);
  });
});
