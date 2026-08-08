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
