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
  // Gift cards are tender — excluded from tax base.
  const discountedLaar = discountedSubtotalLaar(subLaar, {
    promo: discountsLaar.promo ?? 0,
    loyalty: discountsLaar.loyalty ?? 0,
    gift_card: 0,
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
  const giftLaar = discountsLaar.gift_card ?? 0;
  const grandLaar = discountedLaar + taxLaar + deliveryFeeLaar;
  const dueLaar = Math.max(0, grandLaar - giftLaar);
  return {
    subtotal: subLaar / 100,
    tax: taxLaar / 100,
    total: dueLaar / 100,
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

  it("does not reduce GST when gift card tender is applied", () => {
    const withoutGift = previewCheckoutTotalMvr(
      [{ unitMvr: 100, qty: 1, taxRate: 8 }],
      {},
    );
    const withGift = previewCheckoutTotalMvr(
      [{ unitMvr: 100, qty: 1, taxRate: 8 }],
      { gift_card: 4000 },
    );
    expect(withoutGift.tax).toBe(8);
    expect(withGift.tax).toBe(8);
    expect(withGift.total).toBe(withoutGift.total - 40);
  });
});
