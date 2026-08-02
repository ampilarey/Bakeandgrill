import { discountedSubtotalLaar as calcDiscountedSubtotalLaar } from "@shared/utils/effectiveDiscount";
import {
  previewServiceCharge,
  serviceChargeTaxLaarByBuckets,
  type ServiceChargePublicConfig,
} from "@shared/utils/serviceCharge";

export type PosCartLine = {
  price: number;
  quantity: number;
  tax_rate?: number;
  tax_code?: string | null;
  modifiers?: Array<{ price: number }>;
  packaging_fee?: number | null;
  packaging_fee_mode?: "per_unit" | "per_line" | null;
};

export type CartTaxOptions = {
  /** When true, extract embedded GST; when false, add on top (default). */
  taxInclusive?: boolean;
  serviceChargeConfig?: ServiceChargePublicConfig | null;
  /** Backend order type for SC apply flags (e.g. dine_in, takeaway). */
  orderType?: string;
  /** When true, fold packaging GST into the tax preview (default true). */
  packagingFeeTaxable?: boolean;
  /** Packaging principal in MVR (already order-type gated). */
  packagingFeeMvr?: number;
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

/**
 * Per-line GST mirroring useCart.cartTax / OrderTotalsCalculator.
 * Inclusive: extract embedded tax. Exclusive: add tax; optionally include SC tax.
 */
export function cartTaxMvr(
  items: PosCartLine[],
  cartSubtotal: number,
  discountedSubtotal: number,
  defaultTaxRatePercent: number,
  options: CartTaxOptions = {},
): number {
  if (cartSubtotal <= 0) return 0;
  const taxInclusive = !!options.taxInclusive;
  const subtotalLaar = Math.round(cartSubtotal * 100);
  const discountedLaar = Math.round(discountedSubtotal * 100);
  const discountRatio = subtotalLaar > 0 ? discountedLaar / subtotalLaar : 0;
  let taxLaar = 0;
  const buckets: Array<{ ratePercent: number; laar: number }> = [];
  for (const item of items) {
    const rate = effectiveLineTaxRatePercent(item, defaultTaxRatePercent);
    if (rate <= 0) continue;
    const lineGrossLaar = Math.round(lineUnitPrice(item) * item.quantity * 100);
    const effectiveLaar = Math.round(lineGrossLaar * discountRatio);
    if (effectiveLaar <= 0) continue;
    if (taxInclusive) {
      taxLaar += Math.round((effectiveLaar * rate) / (100 + rate));
    } else {
      taxLaar += Math.round((effectiveLaar * rate) / 100);
    }
    buckets.push({ ratePercent: rate, laar: effectiveLaar });
  }
  if (options.serviceChargeConfig) {
    const scPreview = previewServiceCharge(
      options.serviceChargeConfig,
      options.orderType ?? "dine_in",
      discountedLaar,
    );
    // Inclusive: extract embedded SC GST into tax only (grand total unchanged).
    taxLaar += serviceChargeTaxLaarByBuckets(
      options.serviceChargeConfig,
      scPreview.amountLaar,
      buckets,
      taxInclusive,
    );
  }
  const packagingFeeMvr = options.packagingFeeMvr ?? 0;
  const packagingTaxable = options.packagingFeeTaxable !== false;
  if (packagingTaxable && packagingFeeMvr > 0 && defaultTaxRatePercent > 0) {
    taxLaar += packagingTaxLaar(packagingFeeMvr, defaultTaxRatePercent, taxInclusive);
  }
  return taxLaar / 100;
}

/** GST on packaging principal — mirrors GstTaxCalculator::calculateLineTaxLaar. */
export function packagingTaxLaar(
  packagingFeeMvr: number,
  taxRatePercent: number,
  taxInclusive: boolean,
): number {
  if (!(packagingFeeMvr > 0) || !(taxRatePercent > 0)) return 0;
  const laar = Math.round(packagingFeeMvr * 100);
  if (taxInclusive) {
    return Math.round((laar * taxRatePercent) / (100 + taxRatePercent));
  }
  return Math.round((laar * taxRatePercent) / 100);
}

/** @deprecated Prefer cartTaxMvr — kept for call sites that assume exclusive-only. */
export function cartTaxExclusiveMvr(
  items: PosCartLine[],
  cartSubtotal: number,
  discountedSubtotal: number,
  defaultTaxRatePercent: number,
): number {
  return cartTaxMvr(items, cartSubtotal, discountedSubtotal, defaultTaxRatePercent, {
    taxInclusive: false,
  });
}

export function cartPackagingFeeMvr(
  items: PosCartLine[],
  orderType: string,
): number {
  if (orderType === "dine_in") return 0;
  let laar = 0;
  for (const item of items) {
    const feeMvr = Number(item.packaging_fee ?? 0);
    if (!(feeMvr > 0)) continue;
    const qty = Math.max(0, Math.round(item.quantity));
    if (qty <= 0) continue;
    const feeLaar = Math.round(feeMvr * 100);
    const units = item.packaging_fee_mode === "per_line" ? 1 : qty;
    laar += feeLaar * units;
  }
  return laar / 100;
}

export function cartServiceChargeMvr(
  config: ServiceChargePublicConfig | null | undefined,
  orderType: string,
  discountedSubtotal: number,
): number {
  if (!config) return 0;
  return previewServiceCharge(config, orderType, Math.round(discountedSubtotal * 100)).amount;
}

/**
 * Grand total mirroring useCart.cartTotal.
 * Inclusive: do not add tax (already in discountedSubtotal). Packaging always added.
 */
export function cartGrandTotalMvr(
  discountedSubtotal: number,
  taxMvr: number,
  serviceChargeMvr = 0,
  packagingFeeMvr = 0,
  taxInclusive = false,
): number {
  const taxForTotal = taxInclusive ? 0 : taxMvr;
  return Math.round((discountedSubtotal + serviceChargeMvr + taxForTotal + packagingFeeMvr) * 100) / 100;
}
