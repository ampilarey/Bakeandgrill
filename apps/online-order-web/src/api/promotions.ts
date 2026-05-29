// ── Promotions, Loyalty, Gift Cards, Referrals ────────────────────────────────
import { ENDPOINTS } from '@shared/api';
import type { LoyaltyHoldPreview, LoyaltyMeResponse, PromoValidation } from '@shared/types';
import { request } from './client';

// ── Promotions ─────────────────────────────────────────────────────────────────

export async function validatePromoCode(code: string, token?: string): Promise<PromoValidation> {
  return request<PromoValidation>(ENDPOINTS.PROMOTIONS_VALIDATE, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ code }),
  });
}

export async function applyPromoCode(
  token: string,
  orderId: number,
  code: string,
): Promise<{ order: unknown; discount_laar: number; promotion_id: number }> {
  return request(ENDPOINTS.ORDER_APPLY_PROMO(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
}

export async function removePromoCode(token: string, orderId: number, promotionId: number): Promise<{ order: unknown }> {
  return request(ENDPOINTS.ORDER_REMOVE_PROMO(orderId, promotionId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Loyalty ────────────────────────────────────────────────────────────────────

export async function getLoyaltyAccount(token: string): Promise<LoyaltyMeResponse> {
  return request<LoyaltyMeResponse>(ENDPOINTS.LOYALTY_ME, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function previewLoyaltyHold(token: string, orderId: number, points: number): Promise<LoyaltyHoldPreview> {
  return request<LoyaltyHoldPreview>(ENDPOINTS.LOYALTY_HOLD_PREVIEW, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function createLoyaltyHold(
  token: string,
  orderId: number,
  points: number,
): Promise<{ hold: { points_held: number; discount_laar: number } }> {
  return request(ENDPOINTS.LOYALTY_HOLD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function snapshotCustomerCart(
  token: string,
  payload: {
    items: Array<{ id: number; name: string; quantity: number; price?: number }>;
    subtotal_laar?: number;
  },
): Promise<{ cart_token: string; snapshot_at: string }> {
  return request(ENDPOINTS.CUSTOMER_CART_SNAPSHOT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function releaseLoyaltyHold(token: string, orderId: number): Promise<void> {
  await request<void>(`${ENDPOINTS.LOYALTY_HOLD}/${orderId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Gift Cards ─────────────────────────────────────────────────────────────────

export async function checkGiftCardBalance(
  code: string,
): Promise<{ code: string; current_balance: number; expires_at: string | null }> {
  return request(`/gift-cards/${encodeURIComponent(code.toUpperCase())}/balance`);
}

export async function applyGiftCard(
  token: string,
  orderId: number,
  code: string,
): Promise<{ discount_laar: number; discount_mvr: string; card_balance: number }> {
  return request(`/orders/${orderId}/apply-gift-card`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code: code.toUpperCase() }),
  });
}

export async function removeGiftCard(token: string, orderId: number): Promise<void> {
  await request(`/orders/${orderId}/gift-card`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
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

export async function getMyReferralCode(
  token: string,
): Promise<{ code: string; uses_count: number; referee_discount_mvr: number }> {
  return request('/customer/referral-code', { headers: { Authorization: `Bearer ${token}` } });
}

export async function applyReferralToOrder(
  token: string,
  orderId: number,
  code: string,
): Promise<{ code: string; discount_laar: number; discount_mvr: string }> {
  return request(ENDPOINTS.ORDER_APPLY_REFERRAL(orderId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });
}

export async function removeReferralFromOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.ORDER_REMOVE_REFERRAL(orderId), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
