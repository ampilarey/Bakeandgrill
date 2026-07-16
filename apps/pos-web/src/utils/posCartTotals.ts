import { discountedSubtotalLaar as calcDiscountedSubtotalLaar } from "@shared/utils/effectiveDiscount";

export type PosCartLine = {
  price: number;
  quantity: number;
  tax_rate?: number;
  tax_code?: string | null;
  modifiers?: Array<{ price: number }>;
};

export function lineUnitPrice(item: PosCartLine): number {
  const mods = item.modifiers ?? [];
  return item.price + mods.reduce((sum, m) => sum + (m.price ?? 0), 0);
}

export function cartSubtotalFromLines(items: PosCartLine[]): number {
  return items.reduce((sum, item) => sum + lineUnitPrice(item) * item.quantity, 0);
}

/**
 * Mirror backend GstTaxCalculator::resolveTaxRatePercent.
 * Standard-rated lines use the settings default (e.g. 8%), never a
 * corrupt legacy tax_rate like 100 that inflated the GST line.
 */
export function effectiveLineTaxRatePercent(
  item: PosCartLine,
  defaultTaxRatePercent: number,
): number {
  const code = (item.tax_code ?? "").trim();
  if (code === "zero_rated" || code === "exempt" || code === "out_of_scope") {
    return 0;
  }
  // Server create defaults missing codes to standard_8 — never trust legacy
  // tax_rate percents (1–30) that diverge from GstTaxCalculator.
  if (code === "standard_8" || code === "standard" || code === "") {
    return defaultTaxRatePercent;
  }

  // Unknown code → out of scope (0%), matching GstTaxCode::tryFrom fallback.
  return 0;
}

export function discountedSubtotalMvr(
  subtotalMvr: number,
  discountsLaar: { promo?: number; loyalty?: number; gift_card?: number; manual?: number },
): number {
  const subLaar = Math.round(subtotalMvr * 100);
  const afterLaar = calcDiscountedSubtotalLaar(subLaar, {
    promo: discountsLaar.promo ?? 0,
    loyalty: discountsLaar.loyalty ?? 0,
    gift_card: discountsLaar.gift_card ?? 0,
    manual: discountsLaar.manual ?? 0,
  });
  return afterLaar / 100;
}

/** Tax-exclusive GST on discounted line bases (matches useCart / backend allocation). */
export function cartTaxExclusiveMvr(
  items: PosCartLine[],
  cartSubtotal: number,
  discountedSubtotal: number,
  defaultTaxRatePercent: number,
): number {
  if (cartSubtotal <= 0) return 0;
  const subtotalLaar = Math.round(cartSubtotal * 100);
  const discountedLaar = Math.round(discountedSubtotal * 100);
  const discountRatio = subtotalLaar > 0 ? discountedLaar / subtotalLaar : 0;
  let taxLaar = 0;
  for (const item of items) {
    const rate = effectiveLineTaxRatePercent(item, defaultTaxRatePercent);
    if (rate <= 0) continue;
    const lineGrossLaar = Math.round(lineUnitPrice(item) * item.quantity * 100);
    const effectiveLaar = Math.round(lineGrossLaar * discountRatio);
    taxLaar += Math.round((effectiveLaar * rate) / 100);
  }
  return taxLaar / 100;
}

export function cartGrandTotalMvr(
  discountedSubtotal: number,
  taxMvr: number,
  serviceChargeMvr = 0,
): number {
  return Math.round((discountedSubtotal + serviceChargeMvr + taxMvr) * 100) / 100;
}
