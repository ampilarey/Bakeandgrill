import { useCallback, useMemo, useState } from "react";
import type { CartItem, Item, Modifier, Variant } from "../types";
import type { PosCustomer } from "../api";

export type PaymentRow = {
  id: string;
  method: "cash" | "card" | "digital_wallet" | "house_account";
  amount: string;
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
 */
export const makeCartKey = (
  itemId: number,
  modifiers: Modifier[],
  variantId?: number | null,
  notes?: string[],
) =>
  `${itemId}-v${variantId ?? 0}-${modifiers.map((m) => m.id).sort().join(",")}` +
  `-n${(notes ?? []).slice().sort().join("|")}`;

export function useCart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Modifier[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
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
  } | null>(null);
  const [appliedLoyalty, setAppliedLoyalty] = useState<{
    points: number;
    discount: number;
  } | null>(null);
  const [appliedGiftCard, setAppliedGiftCard] = useState<{
    code: string;
    discount: number;
    cardBalance: number;
  } | null>(null);

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

  /**
   * Sum of all customer-rewards discounts. Capped so the running total
   * can never go negative — matches `OrderTotalsCalculator` which does
   * `max(0, subtotal − Σdiscounts)`.
   */
  const rewardsDiscount = useMemo(() => {
    const promo = appliedPromo?.discount ?? 0;
    const loyalty = appliedLoyalty?.discount ?? 0;
    const giftCard = appliedGiftCard?.discount ?? 0;
    return Math.max(0, promo + loyalty + giftCard);
  }, [appliedPromo, appliedLoyalty, appliedGiftCard]);

  /** Grand total of every pre-tax discount applied to this ticket. */
  const totalDiscount = useMemo(
    () => Math.min(cartSubtotal, discountValue + rewardsDiscount),
    [cartSubtotal, discountValue, rewardsDiscount],
  );

  /**
   * Subtotal after discount — the taxable amount.
   * The backend's OrderTotalsCalculator applies discounts proportionally
   * across items BEFORE computing per-item tax. We mirror that here so
   * the POS total matches what the server will charge.
   */
  const discountedSubtotal = useMemo(
    () => Math.max(0, cartSubtotal - totalDiscount),
    [cartSubtotal, totalDiscount],
  );

  /**
   * Tax-EXCLUSIVE per-item GST/TGST.
   *
   * Each item carries a snapshotted `tax_rate` (% — e.g. 8 for TGST). When a
   * discount is applied, the backend reduces every item's taxable amount
   * proportionally (so a 10% discount on the order also shaves 10% off
   * the taxable base of each line). We replicate the exact same math
   * here so the cashier sees the same Tax / Total the server will store
   * and the customer will see on the receipt.
   *
   * Assumes tax-EXCLUSIVE pricing (the default — see `config/app.php`
   * `tax_inclusive`). The receipt template already shows Subtotal + Tax,
   * which only makes sense in exclusive mode. If the business ever flips
   * to inclusive pricing the receipt template would already need an
   * update — this hook would follow suit.
   */
  const cartTax = useMemo(() => {
    if (cartSubtotal <= 0) return 0;
    const discountRatio = discountedSubtotal / cartSubtotal;
    let tax = 0;
    for (const item of cartItems) {
      const rate = Number(item.tax_rate ?? 0);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      const lineGross = lineUnitPrice(item) * item.quantity;
      tax += (lineGross * discountRatio * rate) / 100;
    }
    // Round to 2dp the same way the server's Money helpers do, so the
    // cashier never sees a hidden .005 drift between Charge and receipt.
    return Math.round(tax * 100) / 100;
  }, [cartItems, cartSubtotal, discountedSubtotal]);

  /** Grand total the customer actually owes (matches server `order.total`). */
  const cartTotal = useMemo(
    () => Math.round((discountedSubtotal + cartTax) * 100) / 100,
    [discountedSubtotal, cartTax],
  );

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
      opts?: { variant?: Variant | null; modifiers?: Modifier[] },
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

      // New line is always added with empty `notes`, so the comparison
      // key intentionally uses [] — that way tapping the same item
      // twice still merges to qty 2, but a line that previously had
      // a note attached stays separate (different key suffix).
      const key = makeCartKey(item.id, modifiers, chosenVariant?.id, []);
      setCartItems((curr) => {
        const existing = curr.find(
          (ci) => makeCartKey(ci.id, ci.modifiers, ci.variant_id, ci.notes) === key,
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
            variant_id: chosenVariant?.id ?? null,
            variant_name: chosenVariant?.name ?? null,
            tax_rate: Number.isFinite(parsedTaxRate) ? parsedTaxRate : 0,
            // Notes default to empty — cashier attaches them per line
            // via the in-cart Note picker. They DO factor into the
            // cart key (see makeCartKey) so changing notes on an
            // existing line means "split into a new line", not
            // "rewrite history on a paid-up line".
            notes: [],
          },
        ];
      });
    },
    [selectedItem, selectedModifiers],
  );

  const updateQuantity = useCallback((itemKey: string, delta: number) => {
    setCartItems((curr) =>
      curr
        .map((item) =>
          makeCartKey(item.id, item.modifiers, item.variant_id, item.notes) === itemKey
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

  return {
    cartItems,
    setCartItems,
    selectedItem,
    setSelectedItem,
    selectedModifiers,
    discountAmount,
    setDiscountAmount,
    discountValue,
    payments,
    setPayments,
    cartSubtotal,
    cartTax,
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
  };
}
