import { useCallback, useEffect, useMemo, useState } from "react";
import type { CartItem, Item, Modifier, PackagingOption, Variant } from "../types";
import type { PosCustomer } from "../api";
import { isPackagingEligible, type PosOrderType } from "../orderTypes";
import {
  parseServiceChargePublicSettings,
  previewServiceCharge,
  serviceChargeTaxLaarByBuckets,
  type ServiceChargePublicConfig,
} from "@shared/utils/serviceCharge";
import { discountedSubtotalLaar as calcDiscountedSubtotalLaar } from "@shared/utils/effectiveDiscount";
import { effectiveLineTaxRatePercent, packagingTaxLaar } from "../utils/posCartTotals";
import { fetchPublicSiteSettings, fetchGstBootstrap } from "../api";
import { previewGiftCardDiscount } from "../utils/giftCardPreview";
import {
  loadCachedGstBootstrap,
  loadCachedServiceChargeSettings,
  saveCachedGstBootstrap,
  saveCachedServiceChargeSettings,
} from "../offline/db";

export type PaymentRow = {
  id: string;
  method: "cash" | "card" | "qr" | "digital_wallet" | "house_account" | "wallet";
  amount: string;
  /**
   * FIX 11 — cash overpay: the actual cash the cashier received. Only
   * meaningful on cash rows and only when > amount. Optional so older
   * flows / callers keep working without any changes.
   */
  tendered_amount?: string;
};

/** First active variant, or first listed — matches server expectation when item.has_variants. */
function defaultVariantForItem(item: Item): Variant | null {
  if (!item.has_variants || !item.variants?.length) return null;
  return item.variants.find((x) => x.is_active) ?? item.variants[0];
}

/**
 * Resolve the price that will actually be charged for an item, taking the
 * default variant into account when the item has variants. The MenuGrid
 * uses this to show the same number cashiers will see ringing up.
 */
export function effectiveItemPrice(item: Item, variant?: Variant | null): number {
  const v = variant ?? defaultVariantForItem(item);
  if (v) return Number(v.effective_price ?? v.price ?? 0);
  return Number(item.special?.effective_price ?? item.base_price ?? 0);
}

export function originalItemPrice(item: Item, variant?: Variant | null): number | null {
  const v = variant ?? defaultVariantForItem(item);
  if (v?.effective_price != null && v.original_price != null) {
    return Number(v.original_price);
  }
  if (item.special?.original_price != null && item.special?.effective_price != null) {
    return Number(item.special.original_price);
  }
  return null;
}

/**
 * Identity key used to merge identical lines in the cart (cashier
 * tapping the same item twice = qty 2, not two separate rows).
 *
 * Notes (kitchen comments like "No salt") are part of the key — two
 * burgers with different notes must stay separate lines because they
 * print differently on the kitchen ticket and a single qty:2 would
 * lose the per-portion instruction.
 *
 * Packaging option is also part of the key — Standard vs Large bag
 * must stay separate lines so fees and kitchen tickets stay accurate.
 */
export const makeCartKey = (
  itemId: number,
  modifiers: Modifier[],
  variantId?: number | null,
  notes?: string[],
  packagingOptionId?: number | null,
) =>
  `${itemId}-v${variantId ?? 0}-${modifiers.map((m) => m.id).sort().join(",")}` +
  `-n${(notes ?? []).slice().sort().join("|")}` +
  `-p${packagingOptionId ?? 0}`;

/** Resolve packaging snapshot from catalog options (or legacy item fee). */
export function resolvePackagingSnapshot(
  item: Pick<Item, "packaging_fee" | "packaging_fee_mode" | "packaging_options">,
  packagingOptionId?: number | null,
): {
  packaging_fee: number;
  packaging_fee_mode: "per_unit" | "per_line";
  packaging_option_id: number | null;
  packaging_option_name: string | null;
} {
  const mode = item.packaging_fee_mode === "per_line" ? "per_line" : "per_unit";
  const options = (item.packaging_options ?? []).filter(
    (o): o is PackagingOption => o != null && Number.isFinite(Number(o.id)),
  );
  let opt: PackagingOption | undefined;
  if (packagingOptionId != null) {
    opt = options.find((o) => o.id === packagingOptionId);
  }
  if (!opt && options.length > 0) {
    opt = options.find((o) => o.is_default) ?? options[0];
  }
  if (opt) {
    const fee = Number(opt.fee);
    return {
      packaging_fee: Number.isFinite(fee) ? Math.max(0, fee) : 0,
      packaging_fee_mode: mode,
      packaging_option_id: opt.id,
      packaging_option_name: opt.name ?? null,
    };
  }
  const parsed = item.packaging_fee != null ? parseFloat(String(item.packaging_fee)) : 0;
  return {
    packaging_fee: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    packaging_fee_mode: mode,
    packaging_option_id: null,
    packaging_option_name: null,
  };
}

export function mapPosOrderType(type: PosOrderType): "dine_in" | "takeaway" | "online_pickup" | "delivery" {
  if (type === "Dine-in") return "dine_in";
  if (type === "Pickup") return "online_pickup";
  if (type === "Delivery") return "delivery";
  return "takeaway";
}

export function useCart(posOrderType: PosOrderType = "Takeaway") {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  /** Preset reason label when discount_reason_required is on. */
  const [discountReason, setDiscountReason] = useState<string | null>(null);
  const [discountReasonNote, setDiscountReasonNote] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: crypto.randomUUID(), method: "cash", amount: "" },
  ]);
  /**
   * Customer the cashier has attached to this ticket. Optional — only set
   * when the cashier types/picks a phone or name in the OrderCart's Customer
   * Picker. Drives:
   *   - `customer_id` on the order create payload (so the order is owned by
   *     that customer and surfaces in their /customer/orders history)
   *   - "Send invoice SMS" / "Send receipt SMS" buttons (disabled when no
   *     phone is attached — see OrderCart)
   *   - Auto-fire of the post-payment receipt SMS via the existing
   *     PaymentConfirmationNotifier (already does the right thing whenever
   *     order.customer_id resolves to a row with a phone).
   * Cleared by clearCart after a successful charge.
   */
  const [attachedCustomer, setAttachedCustomer] = useState<PosCustomer | null>(null);

  /**
   * Customer-facing rewards the cashier has STAGED on this ticket. Each one
   * holds the code/amount + the expected discount in MVR. They're applied
   * server-side AFTER the order is created (between createOrder and
   * settleOrder in useOrderCreation) — the cart math here uses the
   * estimated discount so the cashier sees the same number on the Charge
   * button that the server will eventually return.
   *
   * Backend treats all four (manual, promo, loyalty, gift card) as
   * pre-tax discounts that are summed before per-item TGST is applied —
   * see `OrderTotalsCalculator::calculate`. The estimation here mirrors
   * that math exactly to avoid a "you owe MVR 50" → "server says 53"
   * surprise at settle time.
   */
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    promotionId: number | null;
    discount: number;
    /** Hydrated from a resumed server order — display only; do not re-apply. */
    serverApplied?: boolean;
  } | null>(null);
  const [appliedLoyalty, setAppliedLoyalty] = useState<{
    points: number;
    discount: number;
    serverApplied?: boolean;
  } | null>(null);
  const [appliedGiftCard, setAppliedGiftCard] = useState<{
    code: string;
    discount: number;
    cardBalance: number;
    heldBalance?: number;
    serverApplied?: boolean;
  } | null>(null);

  const [serviceChargeConfig, setServiceChargeConfig] = useState<ServiceChargePublicConfig | null>(null);
  const [defaultTaxRatePercent, setDefaultTaxRatePercent] = useState(8);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [packagingFeeTaxable, setPackagingFeeTaxable] = useState(true);
  /**
   * FIX 9: age of the cached tax/service-charge config the cart math is
   * currently using when a fetch failed. `null` when live fetch succeeded.
   * Presented as an informational banner ("using saved settings from …").
   */
  const [settingsCacheAgeMs, setSettingsCacheAgeMs] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const settings = await fetchPublicSiteSettings();
        if (!alive) return;
        setServiceChargeConfig(parseServiceChargePublicSettings(settings));
        void saveCachedServiceChargeSettings(settings as Record<string, unknown>);
      } catch {
        // Live fetch failed — hydrate from IndexedDB BEFORE falling back
        // to hardcoded defaults so offline math still matches settings.
        const cached = await loadCachedServiceChargeSettings();
        if (!alive) return;
        if (cached) {
          setServiceChargeConfig(
            parseServiceChargePublicSettings(cached.settings as never),
          );
          const age = Date.now() - Date.parse(cached.cached_at);
          if (Number.isFinite(age)) setSettingsCacheAgeMs(age);
        } else {
          setServiceChargeConfig(null);
        }
      }
    })();

    (async () => {
      try {
        const b = await fetchGstBootstrap();
        if (!alive) return;
        setDefaultTaxRatePercent(b.tax_rate_percent);
        setTaxInclusive(!!b.tax_inclusive);
        setPackagingFeeTaxable(b.packaging_fee_taxable !== false);
        void saveCachedGstBootstrap({
          tax_rate_percent: b.tax_rate_percent,
          tax_inclusive: !!b.tax_inclusive,
          packaging_fee_taxable: b.packaging_fee_taxable !== false,
        });
      } catch {
        const cached = await loadCachedGstBootstrap();
        if (!alive) return;
        if (cached) {
          setDefaultTaxRatePercent(cached.tax_rate_percent);
          setTaxInclusive(!!cached.tax_inclusive);
          setPackagingFeeTaxable(cached.packaging_fee_taxable !== false);
          const age = Date.now() - Date.parse(cached.cached_at);
          if (Number.isFinite(age)) setSettingsCacheAgeMs((prev) => prev ?? age);
        } else {
          // No cache — last resort defaults (unchanged from before FIX 9).
          setDefaultTaxRatePercent(8);
          setTaxInclusive(false);
          setPackagingFeeTaxable(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const effectiveLineTaxRate = useCallback(
    (item: CartItem): number =>
      effectiveLineTaxRatePercent(
        {
          price: item.price,
          quantity: item.quantity,
          tax_rate: item.tax_rate ?? undefined,
          tax_code: item.tax_code ?? null,
          modifiers: item.modifiers,
        },
        defaultTaxRatePercent,
      ),
    [defaultTaxRatePercent],
  );

  const backendOrderType = mapPosOrderType(posOrderType);

  /** Per-line gross (price + modifiers, ignoring quantity). */
  const lineUnitPrice = (item: CartItem): number =>
    item.price + item.modifiers.reduce((ms, m) => ms + m.price, 0);

  const cartSubtotal = useMemo(
    () =>
      cartItems.reduce((sum, item) => sum + lineUnitPrice(item) * item.quantity, 0),
    [cartItems],
  );

  /** Manual discount in MVR (defensive parse — never NaN, never negative). */
  const discountValue = useMemo(() => {
    const n = parseFloat(discountAmount);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, cartSubtotal);
  }, [discountAmount, cartSubtotal]);

  const rewardsDiscount = useMemo(() => {
    const promo = appliedPromo?.discount ?? 0;
    const loyalty = appliedLoyalty?.discount ?? 0;
    // Gift card is tender (shown separately) — not a pre-tax discount.
    return Math.max(0, promo + loyalty);
  }, [appliedPromo, appliedLoyalty]);

  /**
   * Pre-tax discount total and discounted subtotal — mirrors backend
   * EffectiveDiscount allocation when stacked discounts exceed subtotal.
   * Gift cards are tender and are excluded from the tax base.
   */
  const discountedSubtotal = useMemo(() => {
    const subLaar = Math.round(cartSubtotal * 100);
    const afterLaar = calcDiscountedSubtotalLaar(subLaar, {
      promo: Math.round((appliedPromo?.discount ?? 0) * 100),
      loyalty: Math.round((appliedLoyalty?.discount ?? 0) * 100),
      gift_card: 0,
      manual: Math.round(discountValue * 100),
    });
    return afterLaar / 100;
  }, [cartSubtotal, appliedPromo, appliedLoyalty, discountValue]);

  const totalDiscount = useMemo(
    () => Math.max(0, cartSubtotal - discountedSubtotal),
    [cartSubtotal, discountedSubtotal],
  );

  /**
   * Per-item GST/TGST mirroring OrderTotalsCalculator + GstTaxCalculator.
   * Discounts reduce each line's taxable base proportionally.
   * Service-charge tax uses rate buckets (not a single blended average).
   */
  const cartTax = useMemo(() => {
    if (cartSubtotal <= 0) return 0;
    const subtotalLaar = Math.round(cartSubtotal * 100);
    const discountedLaar = Math.round(discountedSubtotal * 100);
    const discountRatio = subtotalLaar > 0 ? discountedLaar / subtotalLaar : 0;
    let taxLaar = 0;
    const buckets: Array<{ ratePercent: number; laar: number }> = [];
    for (const item of cartItems) {
      const rate = effectiveLineTaxRate(item);
      if (rate <= 0) continue;
      const lineGrossLaar = Math.round(lineUnitPrice(item) * item.quantity * 100);
      const effectiveLaar = Math.round(lineGrossLaar * discountRatio);
      if (effectiveLaar <= 0) continue;
      if (taxInclusive) {
        // Extract embedded tax: amount * r / (100 + r)
        taxLaar += Math.round((effectiveLaar * rate) / (100 + rate));
      } else {
        taxLaar += Math.round((effectiveLaar * rate) / 100);
      }
      buckets.push({ ratePercent: rate, laar: effectiveLaar });
    }
    if (serviceChargeConfig && !taxInclusive) {
      const scPreview = previewServiceCharge(
        serviceChargeConfig,
        backendOrderType,
        discountedLaar,
      );
      taxLaar += serviceChargeTaxLaarByBuckets(
        serviceChargeConfig,
        scPreview.amountLaar,
        buckets,
      );
    }
    // Packaging GST is computed after cartPackagingFee — folded in below.
    return taxLaar / 100;
  }, [cartItems, cartSubtotal, discountedSubtotal, serviceChargeConfig, backendOrderType, effectiveLineTaxRate, taxInclusive]);

  const cartServiceCharge = useMemo(() => {
    if (!serviceChargeConfig) return 0;
    const preview = previewServiceCharge(
      serviceChargeConfig,
      backendOrderType,
      Math.round(discountedSubtotal * 100),
    );
    return preview.amount;
  }, [serviceChargeConfig, backendOrderType, discountedSubtotal]);

  const serviceChargeLabel = serviceChargeConfig?.label ?? "Service charge";

  /** Packaging fee (MVR) — derived from cart lines; zero for dine-in. */
  const cartPackagingFee = useMemo(() => {
    if (backendOrderType === "dine_in") return 0;
    let laar = 0;
    for (const item of cartItems) {
      const feeMvr = Number(item.packaging_fee ?? 0);
      if (!(feeMvr > 0)) continue;
      const qty = Math.max(0, Math.round(item.quantity));
      if (qty <= 0) continue;
      const feeLaar = Math.round(feeMvr * 100);
      const units = item.packaging_fee_mode === "per_line" ? 1 : qty;
      laar += feeLaar * units;
    }
    return laar / 100;
  }, [cartItems, backendOrderType]);

  /** Item/SC tax + optional packaging GST (mirrors OrderTotalsCalculator). */
  const cartTaxWithPackaging = useMemo(() => {
    let taxLaar = Math.round(cartTax * 100);
    if (packagingFeeTaxable && cartPackagingFee > 0) {
      taxLaar += packagingTaxLaar(cartPackagingFee, defaultTaxRatePercent, taxInclusive);
    }
    return taxLaar / 100;
  }, [cartTax, packagingFeeTaxable, cartPackagingFee, defaultTaxRatePercent, taxInclusive]);

  /** Order grand total before gift-card tender (matches server `order.total`). */
  const cartGrandTotal = useMemo(() => {
    // Inclusive: tax is already inside discountedSubtotal / packaging fee —
    // show cartTaxWithPackaging as info only.
    // Exclusive: add tax on top (OrderTotalsCalculator grandTotal branches).
    const taxForTotal = taxInclusive ? 0 : cartTaxWithPackaging;
    return Math.round((discountedSubtotal + cartServiceCharge + taxForTotal + cartPackagingFee) * 100) / 100;
  }, [discountedSubtotal, cartServiceCharge, cartTaxWithPackaging, cartPackagingFee, taxInclusive]);

  /** Amount still due after gift-card tender (what Charge collects in cash/card). */
  const cartTotal = useMemo(() => {
    const gift = appliedGiftCard?.discount ?? 0;
    return Math.round(Math.max(0, cartGrandTotal - gift) * 100) / 100;
  }, [cartGrandTotal, appliedGiftCard?.discount]);

  const handleSelectItem = useCallback((item: Item) => {
    setSelectedItem(item);
    setSelectedModifiers([]);
  }, []);

  const toggleModifier = useCallback((modifier: Modifier) => {
    setSelectedModifiers((curr) => {
      const exists = curr.find((m) => m.id === modifier.id);
      return exists ? curr.filter((m) => m.id !== modifier.id) : [...curr, modifier];
    });
  }, []);

  /**
   * Add an item to the cart, optionally overriding the variant and
   * modifier set. The Configure modal passes its picked `variant` here
   * so cashiers can actually choose Small / Medium / Large — the old
   * implementation silently used `defaultVariantForItem` and dropped
   * the cashier's selection on the floor, which was the main complaint
   * about the variant flow.
   */
  const addToCart = useCallback(
    (
      item: Item,
      opts?: {
        variant?: Variant | null;
        modifiers?: Modifier[];
        packagingOptionId?: number | null;
      },
    ) => {
      // Variant precedence: explicit override > what the cashier picked
      // in the Configure modal > the item's default.
      const chosenVariant: Variant | null =
        opts?.variant ?? defaultVariantForItem(item);

      // Modifiers precedence: explicit override > Configure modal state >
      // empty. Keeps direct add-to-cart from modifier-less tiles working
      // (no modal opens, no selectedModifiers state to pull from).
      const modifiers =
        opts?.modifiers ??
        (selectedItem?.id === item.id ? selectedModifiers : []);

      // Dine-in never attaches packaging (matches PackagingFeeCalculator).
      // Explicit null option + zero fee so one-tap / barcode / configure
      // adds stay consistent; totals already zero packaging for dine_in.
      const packaging = isPackagingEligible(posOrderType)
        ? resolvePackagingSnapshot(item, opts?.packagingOptionId)
        : {
            packaging_fee: 0,
            packaging_fee_mode:
              item.packaging_fee_mode === "per_line" ? ("per_line" as const) : ("per_unit" as const),
            packaging_option_id: null,
            packaging_option_name: null,
          };

      // New line is always added with empty `notes`, so the comparison
      // key intentionally uses [] — that way tapping the same item
      // twice still merges to qty 2, but a line that previously had
      // a note attached stays separate (different key suffix).
      const key = makeCartKey(
        item.id,
        modifiers,
        chosenVariant?.id,
        [],
        packaging.packaging_option_id,
      );
      setCartItems((curr) => {
        const existing = curr.find(
          (ci) =>
            makeCartKey(
              ci.id,
              ci.modifiers,
              ci.variant_id,
              ci.notes,
              ci.packaging_option_id,
            ) === key,
        );
        if (existing) {
          return curr.map((ci) =>
            ci === existing ? { ...ci, quantity: ci.quantity + 1 } : ci,
          );
        }
        const parsedPrice = chosenVariant
          ? Number(chosenVariant.effective_price ?? chosenVariant.price ?? 0)
          : Number(item.special?.effective_price ?? item.base_price ?? 0);
        const parsedModifiers = modifiers.map((m) => ({
          ...m,
          price: parseFloat(String(m.price ?? 0)),
        }));
        const parsedTaxRate =
          item.tax_rate != null ? parseFloat(String(item.tax_rate)) : 0;
        return [
          ...curr,
          {
            id: item.id,
            name: item.name,
            price: parsedPrice,
            quantity: 1,
            modifiers: parsedModifiers,
            packaging_fee: packaging.packaging_fee,
            packaging_fee_mode: packaging.packaging_fee_mode,
            packaging_option_id: packaging.packaging_option_id,
            packaging_option_name: packaging.packaging_option_name,
            variant_id: chosenVariant?.id ?? null,
            variant_name: chosenVariant?.name ?? null,
            tax_rate: Number.isFinite(parsedTaxRate) ? parsedTaxRate : 0,
            tax_code: item.tax_code ?? "standard_8",
            // Notes default to empty — cashier attaches them per line
            // via the in-cart Note picker. They DO factor into the
            // cart key (see makeCartKey) so changing notes on an
            // existing line means "split into a new line", not
            // "rewrite history on a paid-up line".
            notes: [],
            is_catering: !!item.is_catering,
          },
        ];
      });
    },
    [selectedItem, selectedModifiers, posOrderType],
  );

  const updateQuantity = useCallback((itemKey: string, delta: number) => {
    setCartItems((curr) =>
      curr
        .map((item) =>
          makeCartKey(
            item.id,
            item.modifiers,
            item.variant_id,
            item.notes,
            item.packaging_option_id,
          ) === itemKey
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setSelectedItem(null);
    setSelectedModifiers([]);
    setDiscountAmount("");
    setDiscountReason(null);
    setDiscountReasonNote("");
    setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "" }]);
    setAttachedCustomer(null);
    // Reset every staged reward so the next ticket starts clean. Without
    // this a previously-redeemed loyalty hold would carry into a fresh
    // sale and the cashier would see a phantom discount on the Charge
    // button until they manually cleared it.
    setAppliedPromo(null);
    setAppliedLoyalty(null);
    setAppliedGiftCard(null);
  }, []);

  const addPaymentRow = useCallback(() =>
    setPayments((curr) => [...curr, { id: crypto.randomUUID(), method: "cash", amount: "" }]), []);

  const updatePaymentRow = useCallback((id: string, changes: Partial<PaymentRow>) =>
    setPayments((curr) => curr.map((p) => (p.id === id ? { ...p, ...changes } : p))), []);

  const removePaymentRow = useCallback((id: string) =>
    setPayments((curr) => curr.filter((p) => p.id !== id)), []);

  /**
   * Detach the current customer AND drop every reward staged against
   * them. A loyalty hold or promo code that was earned by a specific
   * customer must not bleed onto an anonymous walk-in ticket.
   */
  const detachCustomer = useCallback(() => {
    setAttachedCustomer(null);
    setAppliedLoyalty(null);
    setAppliedPromo(null);
    // Gift cards are bearer instruments — a different customer (or no
    // customer) could legitimately still present the card. Keep it
    // staged unless the cashier explicitly removes it.
  }, []);

  // Keep staged gift-card tender in sync when cart / other discounts change.
  // Cap against grand total (after tax), not merchandise subtotal.
  useEffect(() => {
    if (!appliedGiftCard) return;
    // Resumed tickets hydrate a display-only gift card (balance unknown) —
    // never re-preview or clear it from client-side room math.
    if (appliedGiftCard.serverApplied) return;
    const room = cartGrandTotal;
    const preview = previewGiftCardDiscount(
      appliedGiftCard.cardBalance,
      appliedGiftCard.heldBalance ?? 0,
      room,
    );
    if (!preview.ok) {
      setAppliedGiftCard(null);
      return;
    }
    if (preview.discount !== appliedGiftCard.discount) {
      setAppliedGiftCard({ ...appliedGiftCard, discount: preview.discount });
    }
  }, [
    cartGrandTotal,
    appliedGiftCard?.code,
    appliedGiftCard?.cardBalance,
    appliedGiftCard?.heldBalance,
    appliedGiftCard?.discount,
    appliedGiftCard?.serverApplied,
  ]);

  return {
    cartItems,
    setCartItems,
    selectedItem,
    setSelectedItem,
    selectedModifiers,
    discountAmount,
    setDiscountAmount,
    discountReason,
    setDiscountReason,
    discountReasonNote,
    setDiscountReasonNote,
    discountValue,
    payments,
    setPayments,
    cartSubtotal,
    discountedSubtotal,
    cartTax: cartTaxWithPackaging,
    cartServiceCharge,
    serviceChargeLabel,
    cartPackagingFee,
    cartGrandTotal,
    cartTotal,
    totalDiscount,
    rewardsDiscount,
    handleSelectItem,
    toggleModifier,
    addToCart,
    updateQuantity,
    clearCart,
    addPaymentRow,
    updatePaymentRow,
    removePaymentRow,
    attachedCustomer,
    setAttachedCustomer,
    detachCustomer,
    // ── Customer rewards staged on the ticket ──────────────────
    appliedPromo,
    setAppliedPromo,
    appliedLoyalty,
    setAppliedLoyalty,
    appliedGiftCard,
    setAppliedGiftCard,
    /** FIX 9: non-null age (ms) when cart math is using cached tax settings. */
    settingsCacheAgeMs,
  };
}
