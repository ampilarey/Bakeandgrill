import { describe, expect, it } from "vitest";
import type { ServiceChargePublicConfig } from "@shared/utils/serviceCharge";
import {
  cartGrandTotalMvr,
  cartPackagingFeeMvr,
  cartServiceChargeMvr,
  cartSubtotalFromLines,
  cartTaxExclusiveMvr,
  cartTaxMvr,
  discountedSubtotalMvr,
  lineUnitPrice,
} from "./posCartTotals";

const taxableSc: ServiceChargePublicConfig = {
  enabled: true,
  label: "Service charge",
  type: "percent",
  value: 10,
  apply_dine_in: true,
  apply_takeaway: true,
  apply_online_pickup: false,
  apply_delivery: false,
  taxable: true,
};

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

  it("uses settings default when tax_code missing (ignores legacy tax_rate)", () => {
    const items = [{ price: 15, quantity: 1, tax_rate: 25 }];
    const sub = cartSubtotalFromLines(items);
    const tax = cartTaxExclusiveMvr(items, sub, sub, 8);
    expect(tax).toBe(1.2);
  });

  it("exclusive: total = discountedSubtotal + SC + tax + packaging", () => {
    const items = [{ price: 100, quantity: 1, packaging_fee: 5 }];
    const sub = cartSubtotalFromLines(items);
    const discounted = sub;
    const tax = cartTaxMvr(items, sub, discounted, 8, {
      taxInclusive: false,
      serviceChargeConfig: taxableSc,
      orderType: "takeaway",
    });
    const sc = cartServiceChargeMvr(taxableSc, "takeaway", discounted);
    const packaging = cartPackagingFeeMvr(items, "takeaway");
    // SC = 10% of 100 = 10; item tax = 8; SC tax = 0.8; packaging = 5
    expect(sc).toBe(10);
    expect(tax).toBe(8.8);
    expect(packaging).toBe(5);
    expect(cartGrandTotalMvr(discounted, tax, sc, packaging, false)).toBe(123.8);
  });

  it("inclusive: total = discountedSubtotal + SC + packaging; tax extracted; no SC tax", () => {
    const items = [{ price: 100, quantity: 1, packaging_fee: 5 }];
    const sub = cartSubtotalFromLines(items);
    const discounted = sub;
    const tax = cartTaxMvr(items, sub, discounted, 8, {
      taxInclusive: true,
      serviceChargeConfig: taxableSc,
      orderType: "takeaway",
    });
    const sc = cartServiceChargeMvr(taxableSc, "takeaway", discounted);
    const packaging = cartPackagingFeeMvr(items, "takeaway");
    // Embedded tax: round(10000 * 8 / 108) = 741 laar = 7.41; no SC tax
    expect(tax).toBe(7.41);
    expect(sc).toBe(10);
    expect(packaging).toBe(5);
    // Grand total must NOT add tax again
    expect(cartGrandTotalMvr(discounted, tax, sc, packaging, true)).toBe(115);
  });

  it("inclusive 100 MVR at 8% GST: total 100, tax ~7.41 (no SC/packaging)", () => {
    const items = [{ price: 100, quantity: 1 }];
    const sub = 100;
    const tax = cartTaxMvr(items, sub, sub, 8, { taxInclusive: true });
    expect(tax).toBe(7.41);
    expect(cartGrandTotalMvr(sub, tax, 0, 0, true)).toBe(100);
  });

  it("exclusive 100 MVR at 8% GST: total 108", () => {
    const items = [{ price: 100, quantity: 1 }];
    const sub = 100;
    const tax = cartTaxMvr(items, sub, sub, 8, { taxInclusive: false });
    expect(tax).toBe(8);
    expect(cartGrandTotalMvr(sub, tax, 0, 0, false)).toBe(108);
  });

  it("applies discount before tax, proportionally across lines", () => {
    const items = [
      { price: 60, quantity: 1 },
      { price: 40, quantity: 1 },
    ];
    const sub = cartSubtotalFromLines(items);
    // 20 MVR manual discount (2000 laar)
    const discounted = discountedSubtotalMvr(sub, { manual: 2000 });
    expect(sub).toBe(100);
    expect(discounted).toBe(80);

    const taxExclusive = cartTaxMvr(items, sub, discounted, 8, { taxInclusive: false });
    // Each line gets 80% base: 48 + 32 = 80; tax = 6.4
    expect(taxExclusive).toBe(6.4);
    expect(cartGrandTotalMvr(discounted, taxExclusive)).toBe(86.4);

    const taxInclusive = cartTaxMvr(items, sub, discounted, 8, { taxInclusive: true });
    // Extract: round(4800*8/108) + round(3200*8/108) = 356 + 237 = 593 → 5.93
    expect(taxInclusive).toBe(5.93);
    expect(cartGrandTotalMvr(discounted, taxInclusive, 0, 0, true)).toBe(80);
  });
});
