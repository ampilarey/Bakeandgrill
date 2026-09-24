/**
 * Checkout pending-order reuse helpers.
 *
 * After a successful BML pay, online orders sit at kitchen status `pending`
 * with payment_status=paid. Reusing that id for a reorder/pay attempt hits
 * zero_balance. Only reuse orders that still owe money.
 */

export const CHECKOUT_PENDING_ORDER_KEY = 'checkout_pending_order_id';

export type PendingOrderSnapshot = {
  id: number;
  status: string;
  payment_status?: string | null;
  remaining_balance_laar?: number | null;
  total_laar?: number | null;
  total?: number | string | null;
  gift_card_discount_laar?: number | null;
};

/** sessionStorage — shared with useCheckout. */
export function readCheckoutPendingOrderId(): number | null {
  try {
    const stored = sessionStorage.getItem(CHECKOUT_PENDING_ORDER_KEY);
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
}

export function writeCheckoutPendingOrderId(id: number | null): void {
  try {
    if (id) sessionStorage.setItem(CHECKOUT_PENDING_ORDER_KEY, String(id));
    else sessionStorage.removeItem(CHECKOUT_PENDING_ORDER_KEY);
  } catch { /* ignore quota / private mode */ }
}

export function clearCheckoutPendingOrderId(): void {
  writeCheckoutPendingOrderId(null);
  writeCheckoutAttempt(null);
}

/*
 * Checkout audit, 2026-09-26. A customer who backed out of the bank page,
 * changed the cart and paid again was charged for the old cart: the unpaid
 * order was reused whatever it contained. Each attempt now records what it
 * was for (a fingerprint of the cart, order type, time and address) and a
 * key the server uses to return the same order on a retried request. A
 * different fingerprint means a new order and a new key.
 */
export const CHECKOUT_ATTEMPT_KEY = 'checkout_attempt';

export type CheckoutAttempt = { signature: string; key: string };

export function readCheckoutAttempt(): CheckoutAttempt | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutAttempt;
    return typeof parsed?.signature === 'string' && typeof parsed?.key === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCheckoutAttempt(attempt: CheckoutAttempt | null): void {
  try {
    if (attempt) sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
  } catch { /* ignore quota / private mode */ }
}

export function newCheckoutKey(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export type CheckoutSignatureInput = {
  orderType: string;
  collectOn?: string | null;
  pickupSlotAt?: string | null;
  partySize?: number | null;
  tableToken?: string | null;
  address?: { line1?: string; line2?: string; island?: string } | null;
  items: Array<{
    id: number;
    quantity: number;
    variantId?: number | null;
    packagingOptionId?: number | null;
    modifierIds?: number[];
    children?: unknown;
  }>;
};

/** Stable fingerprint of what the customer is about to pay for. */
export function checkoutSignature(input: CheckoutSignatureInput): string {
  const items = input.items
    .map((i) => [
      i.id,
      i.quantity,
      i.variantId ?? null,
      i.packagingOptionId ?? null,
      [...(i.modifierIds ?? [])].sort((a, b) => a - b),
      i.children ?? null,
    ])
    .map((row) => JSON.stringify(row))
    .sort();
  return JSON.stringify({
    t: input.orderType,
    c: input.collectOn ?? null,
    s: input.pickupSlotAt ?? null,
    p: input.orderType === 'dine_in' ? (input.partySize ?? null) : null,
    q: input.tableToken ?? null,
    a: input.orderType === 'delivery'
      ? [input.address?.line1?.trim() ?? '', input.address?.line2?.trim() ?? '', input.address?.island?.trim().toLowerCase() ?? '']
      : null,
    i: items,
  });
}

/**
 * The attempt to use now: the stored one while the fingerprint matches,
 * otherwise a new one (and `changed` so the old unpaid order can be dropped).
 */
export function attemptFor(signature: string, stored: CheckoutAttempt | null): { attempt: CheckoutAttempt; changed: boolean } {
  if (stored && stored.signature === signature) {
    return { attempt: stored, changed: false };
  }
  return { attempt: { signature, key: newCheckoutKey() }, changed: stored !== null };
}

/**
 * True when checkout may safely resume payment on this order
 * (e.g. customer returned from a cancelled BML attempt).
 */
export function isPendingOrderReusable(order: PendingOrderSnapshot): boolean {
  if (['cancelled', 'refunded', 'completed', 'paid'].includes(order.status)) {
    return false;
  }
  if (order.payment_status === 'paid') {
    return false;
  }
  const remaining = dueLaarFromOrder(order);
  // Fully covered (gift card / loyalty / prior payments) — do not reuse for a new cart.
  if (remaining <= 0) {
    return false;
  }
  return true;
}

/**
 * Server-aligned amount due. Prefer remaining_balance_laar (subtracts settled
 * payments + gift tender); fall back to total − gift for older payloads.
 */
export function dueLaarFromOrder(order: PendingOrderSnapshot): number {
  if (typeof order.remaining_balance_laar === 'number') {
    return Math.max(0, order.remaining_balance_laar);
  }
  const grandLaar =
    typeof order.total_laar === 'number'
      ? order.total_laar
      : Math.round(Number(order.total ?? 0) * 100);
  const giftTenderLaar = Math.max(0, Number(order.gift_card_discount_laar ?? 0));
  return Math.max(0, grandLaar - giftTenderLaar);
}

export function isZeroBalanceApiError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number; body?: { code?: string }; message?: string };
  if (e.body?.code === 'zero_balance') return true;
  if (typeof e.message === 'string' && /nothing to pay/i.test(e.message)) return true;
  return false;
}
