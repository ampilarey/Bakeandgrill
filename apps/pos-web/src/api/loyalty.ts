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

export type PromoPreviewLine = {
  item_id: number;
  quantity: number;
  unit_price: number;
  total_price?: number;
};

/** Server-side promo preview for the POS cart (or an existing order). */
export async function previewPromoForCart(input: {
  code: string;
  items?: PromoPreviewLine[];
  customerId?: number | null;
  orderId?: number | null;
}): Promise<{
  valid: boolean;
  message?: string;
  discount_laar: number;
  discount_mvr: string;
  promotion?: { id?: number; name: string; type: string; discount_value: number; scope: string } | null;
}> {
  return request("/pos/promos/preview", {
    method: "POST",
    body: JSON.stringify({
      code: input.code,
      ...(input.orderId != null ? { order_id: input.orderId } : {}),
      ...(input.customerId != null ? { customer_id: input.customerId } : {}),
      ...(input.items && input.items.length > 0 ? { items: input.items } : {}),
    }),
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

/** Preview how much a loyalty redemption would discount without placing a hold.
 *  Prefer cart context (customer + merchandise) when the ticket is not yet created. */
export async function previewLoyaltyRedeem(input: {
  points: number;
  orderId?: number | null;
  customerId?: number | null;
  merchandiseSubtotalLaar?: number;
  promoDiscountLaar?: number;
  manualDiscountLaar?: number;
}): Promise<{
  points: number;
  discount_laar: number;
  discount_mvr: string;
  available_points: number;
  min_redeem_points?: number;
  max_redeem_percent?: number;
  message?: string;
}> {
  return request("/pos/loyalty/preview", {
    method: "POST",
    body: JSON.stringify({
      points: input.points,
      ...(input.orderId != null ? { order_id: input.orderId } : {}),
      ...(input.customerId != null ? { customer_id: input.customerId } : {}),
      ...(input.merchandiseSubtotalLaar != null
        ? { merchandise_subtotal_laar: input.merchandiseSubtotalLaar }
        : {}),
      ...(input.promoDiscountLaar != null ? { promo_discount_laar: input.promoDiscountLaar } : {}),
      ...(input.manualDiscountLaar != null ? { manual_discount_laar: input.manualDiscountLaar } : {}),
    }),
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

/** Lightweight balance check — public POST (code in body, not URL).
 *  Returns ledger balance plus available/held after soft-reserves on
 *  unpaid orders so POS preview matches what apply will actually use. */
export async function checkGiftCardBalance(code: string): Promise<{
  masked_code: string;
  current_balance: number;
  available_balance: number;
  held_balance: number;
  expires_at: string | null;
}> {
  return request('/gift-cards/balance', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
}

/** Apply a gift card to a POS order. The server sets gift_card_id +
 *  gift_card_discount_laar on the order row and recalculates totals; the
 *  actual balance debit happens at payment time via PaymentService. */
export async function applyGiftCardToOrder(
  orderId: number,
  code: string,
): Promise<{
  discount_laar: number;
  discount_mvr: string;
  card_balance: number;
  available_balance: number;
  masked_code: string;
  order: {
    id: number;
    total: number;
    subtotal: number;
    tax_amount: number;
    gift_card_discount_laar: number;
    gift_card_masked?: string;
  };
}> {
  return request(`/pos/orders/${orderId}/gift-card`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function removeGiftCardFromOrder(orderId: number): Promise<{ message: string }> {
  return request(`/pos/orders/${orderId}/gift-card`, { method: "DELETE" });
}
