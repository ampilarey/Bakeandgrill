import { describe, expect, it } from "vitest";
import { discountedSubtotalLaar } from "@shared/utils/effectiveDiscount";

/** Mirrors checkout stacked-discount + tax-exclusive preview used in useCheckout. */
function previewCheckoutTotalMvr(
  lines: Array<{ unitMvr: number; qty: number; taxRate?: number }>,
  discountsLaar: { promo?: number; loyalty?: number; gift_card?: number },
  deliveryFeeLaar = 0,
): { subtotal: number; tax: number; total: number } {
  const subLaar = lines.reduce(
    (sum, line) => sum + Math.round(line.unitMvr * 100) * line.qty,
    0,
  );
  const discountedLaar = discountedSubtotalLaar(subLaar, {
    promo: discountsLaar.promo ?? 0,
    loyalty: discountsLaar.loyalty ?? 0,
    gift_card: discountsLaar.gift_card ?? 0,
    manual: 0,
  });
  const ratio = subLaar > 0 ? discountedLaar / subLaar : 0;
  let taxLaar = 0;
  for (const line of lines) {
    const rate = line.taxRate ?? 8;
    const lineLaar = Math.round(line.unitMvr * 100) * line.qty;
    const effective = Math.round(lineLaar * ratio);
    taxLaar += Math.round((effective * rate) / 100);
  }
  const totalLaar = discountedLaar + taxLaar + deliveryFeeLaar;
  return {
    subtotal: subLaar / 100,
    tax: taxLaar / 100,
    total: totalLaar / 100,
  };
}

describe("checkoutTotals", () => {
  it("applies promo and loyalty without double-counting past subtotal", () => {
    const preview = previewCheckoutTotalMvr(
      [{ unitMvr: 40, qty: 2, taxRate: 8 }],
      { promo: 3000, loyalty: 2000 },
    );
    expect(preview.subtotal).toBe(80);
    expect(preview.tax).toBe(2.4);
    expect(preview.total).toBe(32.4);
  });

  it("includes delivery fee in amount due", () => {
    const preview = previewCheckoutTotalMvr(
      [{ unitMvr: 30, qty: 1, taxRate: 8 }],
      {},
      1500,
    );
    expect(preview.total).toBe(32.4 + 15);
  });
});
