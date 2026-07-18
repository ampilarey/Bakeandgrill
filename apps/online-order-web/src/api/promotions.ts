// ── Promotions, Loyalty, Gift Cards, Referrals ────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { LoyaltyHoldPreview, LoyaltyMeResponse, PromoValidation } from '@shared/types';
import { request } from './client';

// ── Promotions ─────────────────────────────────────────────────────────────────

export async function validatePromoCode(code: string): Promise<PromoValidation> {
  return request<PromoValidation>(ENDPOINTS.PROMOTIONS_VALIDATE, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function applyPromoCode(
  orderId: number,
  code: string,
): Promise<{ order: unknown; discount_laar: number; promotion_id: number }> {
  return request(ENDPOINTS.ORDER_APPLY_PROMO(orderId), {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function removePromoCode(orderId: number, promotionId: number): Promise<{ order: unknown }> {
  return request(ENDPOINTS.ORDER_REMOVE_PROMO(orderId, promotionId), {
    method: 'DELETE',
  });
}

// ── Loyalty ────────────────────────────────────────────────────────────────────

export async function getLoyaltyAccount(): Promise<LoyaltyMeResponse> {
  return request<LoyaltyMeResponse>(ENDPOINTS.LOYALTY_ME);
}

export async function previewLoyaltyHold(orderId: number, points: number): Promise<LoyaltyHoldPreview> {
  return request<LoyaltyHoldPreview>(ENDPOINTS.LOYALTY_HOLD_PREVIEW, {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function createLoyaltyHold(
  orderId: number,
  points: number,
): Promise<{ hold: { points_held: number; discount_laar: number } }> {
  return request(ENDPOINTS.LOYALTY_HOLD, {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function snapshotCustomerCart(
  payload: {
    items: Array<{ id: number; name: string; quantity: number; price?: number }>;
    subtotal_laar?: number;
  },
): Promise<{ cart_token: string; snapshot_at: string }> {
  return request(ENDPOINTS.CUSTOMER_CART_SNAPSHOT, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function releaseLoyaltyHold(orderId: number): Promise<void> {
  await request<void>(`${ENDPOINTS.LOYALTY_HOLD}/${orderId}`, {
    method: 'DELETE',
  });
}

// ── Gift Cards ─────────────────────────────────────────────────────────────────

export async function checkGiftCardBalance(
  code: string,
): Promise<{
  masked_code: string;
  current_balance: number;
  available_balance: number;
  held_balance: number;
  expires_at: string | null;
}> {
  return request(ENDPOINTS.GIFT_CARD_BALANCE_POST, {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
}

export async function purchaseGiftCard(data: {
  amount: number;
  recipient_phone?: string | null;
  recipient_email?: string | null;
  personal_note?: string | null;
}): Promise<{
  order_id: number;
  order_number: string;
  payment_url: string;
  payment_id: number;
  amount: number;
}> {
  return request('/gift-cards/purchase', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export type GiftCardPurchaseDelivery = {
  phone: string | null;
  email: string | null;
  sms_ok: boolean | null;
  email_ok: boolean | null;
  can_resend?: boolean;
  resend_count?: number;
  expires_at?: string | null;
};

export async function getGiftCardPurchaseStatus(orderId: number): Promise<{
  order_id: number;
  order_number: string;
  status: string;
  payment_status: string | null;
  amount: number;
  issued: boolean;
  gift_card: {
    masked_code: string;
    initial_balance: number;
    current_balance: number;
    status: string;
    expires_at: string | null;
  } | null;
  delivery: GiftCardPurchaseDelivery;
}> {
  return request(`/gift-cards/purchases/${orderId}`);
}

export async function resendGiftCardPurchaseDelivery(
  orderId: number,
  channel: 'sms' | 'email' | 'both' = 'both',
): Promise<{ message: string; delivery: GiftCardPurchaseDelivery }> {
  return request(`/gift-cards/purchases/${orderId}/resend`, {
    method: 'POST',
    body: JSON.stringify({ channel }),
  });
}

export async function applyGiftCard(
  orderId: number,
  code: string,
): Promise<{ discount_laar: number; discount_mvr: string; card_balance: number }> {
  return request(`/orders/${orderId}/apply-gift-card`, {
    method: 'POST',
    body: JSON.stringify({ code: code.toUpperCase() }),
  });
}

export async function removeGiftCard(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/gift-card`, {
    method: 'DELETE',
  });
}

// ── Referrals ──────────────────────────────────────────────────────────────────

export async function validateReferralCode(
  code: string,
): Promise<{ valid: true; referee_discount_mvr: number } | { valid: false; message?: string }> {
  try {
    return await request<{ valid: true; referee_discount_mvr: number }>(ENDPOINTS.REFERRALS_VALIDATE, {
      method: 'POST',
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
  } catch (e) {
    const msg = (e as Error).message;
    return { valid: false, message: msg };
  }
}

export async function getMyReferralCode(): Promise<{ code: string; uses_count: number; referee_discount_mvr: number }> {
  return request('/customer/referral-code');
}

export async function applyReferralToOrder(
  orderId: number,
  code: string,
): Promise<{ code: string; discount_laar: number; discount_mvr: string }> {
  return request(ENDPOINTS.ORDER_APPLY_REFERRAL(orderId), {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
}

export async function removeReferralFromOrder(orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.ORDER_REMOVE_REFERRAL(orderId), {
    method: 'DELETE',
  });
}
