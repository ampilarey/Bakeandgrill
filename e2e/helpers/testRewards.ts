/**
 * Ensure ephemeral promo / gift-card fixtures exist on the target environment.
 * Uses staff API — skipped gracefully when credentials are unavailable.
 */
import { type APIRequestContext } from '@playwright/test';
import { obtainStaffToken } from '../fixtures/auth';

export const E2E_PROMO_CODE = process.env.E2E_PROMO_CODE ?? 'E2ETEST10';
const E2E_PROMO_DISCOUNT_LAARI = 1000; // MVR 10.00 fixed off

function staffHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function promoIsValid(request: APIRequestContext, code: string): Promise<boolean> {
  const res = await request.post('/api/promotions/validate', {
    data: { code },
  });
  if (!res.ok()) return false;
  const body = await res.json() as { valid?: boolean };
  return body.valid === true;
}

async function findPromoId(request: APIRequestContext, token: string, code: string): Promise<number | null> {
  const res = await request.get('/api/admin/promotions?per_page=100', {
    headers: staffHeaders(token),
  });
  if (!res.ok()) return null;
  const body = await res.json() as { data?: Array<{ id: number; code: string }> };
  return body.data?.find((p) => p.code.toUpperCase() === code.toUpperCase())?.id ?? null;
}

/** Create or reactivate the shared E2E fixed promo. Returns code or empty string. */
export async function ensureE2EPromo(request: APIRequestContext): Promise<string> {
  if (await promoIsValid(request, E2E_PROMO_CODE)) {
    return E2E_PROMO_CODE;
  }

  const token = await obtainStaffToken(request);
  if (!token) return '';

  const create = await request.post('/api/admin/promotions', {
    headers: staffHeaders(token),
    data: {
      name: 'E2E Checkout Promo',
      code: E2E_PROMO_CODE,
      type: 'fixed',
      discount_value: E2E_PROMO_DISCOUNT_LAARI,
      is_active: true,
      scope: 'order',
      stackable: true,
    },
  });

  if (create.ok() || create.status() === 201) {
    return E2E_PROMO_CODE;
  }

  const id = await findPromoId(request, token, E2E_PROMO_CODE);
  if (id) {
    await request.patch(`/api/admin/promotions/${id}`, {
      headers: staffHeaders(token),
      data: { is_active: true },
    });
    if (await promoIsValid(request, E2E_PROMO_CODE)) {
      return E2E_PROMO_CODE;
    }
  }

  return '';
}

/** Issue a fresh gift card for checkout tests. Returns code or empty string. */
export async function issueE2EGiftCard(request: APIRequestContext, amountMvr = 25): Promise<string> {
  const token = await obtainStaffToken(request);
  if (!token) return '';

  const res = await request.post('/api/admin/gift-cards', {
    headers: staffHeaders(token),
    data: { amount: amountMvr },
  });

  if (!res.ok()) return '';

  const body = await res.json() as { gift_card?: { code?: string } };
  return body.gift_card?.code ?? '';
}
