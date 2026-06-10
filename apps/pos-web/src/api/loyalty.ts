import { request } from "./client";

/** Validate a promo code BEFORE ringing the order. Returns the estimated
 *  discount when an order_id is provided, otherwise just confirms validity
 *  so the cart can show "code is valid — discount will apply at checkout". */
export async function validatePromoCode(
  code: string,
  orderId?: number,
): Promise<{
  valid: boolean;
  message?: string;
  discount_laar?: number;
  discount_mvr?: string;
  promotion?: { name: string; type: string; discount_value: number; scope: string };
}> {
  return request("/promotions/validate", {
    method: "POST",
    body: JSON.stringify({ code, ...(orderId != null ? { order_id: orderId } : {}) }),
  });
}

/** Apply a previously-validated promo code to an existing order. Server
 *  enforces the staff `promotions.discounts` permission. */
export async function applyPromoToOrder(
  orderId: number,
  code: string,
): Promise<{ message: string; discount_laar: number; discount_mvr: string; promotion_id: number }> {
  return request(`/orders/${orderId}/apply-promo`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/** Preview how much a loyalty redemption would discount the order without
 *  actually placing the hold. Server caps `points` at the customer's
 *  current available balance. */
export async function previewLoyaltyRedeem(
  orderId: number,
  points: number,
): Promise<{
  points: number;
  discount_laar: number;
  discount_mvr: string;
  available_points: number;
}> {
  return request("/pos/loyalty/preview", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

/** Place / refresh a loyalty hold on the order (debits available_points
 *  once consumed on payment). Returns the discount actually applied. */
export async function holdLoyaltyForOrder(
  orderId: number,
  points: number,
): Promise<{
  hold: { points_held: number; discount_laar: number; discount_mvr: string; expires_at: string };
  order: { id: number; total: number; subtotal: number; tax_amount: number; loyalty_discount_laar: number };
}> {
  return request("/pos/loyalty/hold", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function releaseLoyaltyHold(orderId: number): Promise<{ message: string }> {
  return request(`/pos/loyalty/hold/${orderId}`, { method: "DELETE" });
}

/** Lightweight balance check — public route, no auth needed. The POS
 *  uses this before applying so the cashier can see "MVR 250 on this
 *  card" before they commit it as a tender. */
export async function checkGiftCardBalance(code: string): Promise<{
  code: string;
  current_balance: number;
  expires_at: string | null;
}> {
  return request(`/gift-cards/${encodeURIComponent(code)}/balance`);
}

/** Apply a gift card to a POS order. The server sets gift_card_code +
 *  gift_card_discount_laar on the order row and recalculates totals; the
 *  actual balance debit happens at payment time via PaymentService. */
export async function applyGiftCardToOrder(
  orderId: number,
  code: string,
): Promise<{
  discount_laar: number;
  discount_mvr: string;
  card_balance: number;
  order: { id: number; total: number; subtotal: number; tax_amount: number; gift_card_discount_laar: number };
}> {
  return request(`/pos/orders/${orderId}/gift-card`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function removeGiftCardFromOrder(orderId: number): Promise<{ message: string }> {
  return request(`/pos/orders/${orderId}/gift-card`, { method: "DELETE" });
}
