/**
 * 1.9 — discount then pay: GST on the discounted amount (cash, no card).
 */
import { test, expect } from '@playwright/test';

import {
  ensureOpenShift,
  firstMenuItemId,
  staffHeaders,
} from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';

test.describe('Part 1 — discount GST', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
  });

  test('1.9 apply a discount then pay — GST on discounted amount @checklist-1.9', async ({
    request,
  }) => {
    const headers = await staffHeaders(request);
    await ensureOpenShift(request);
    const itemId = await firstMenuItemId(request);

    const full = await request.post('/api/orders', {
      headers,
      data: {
        type: 'takeaway',
        items: [{ item_id: itemId, quantity: 2 }],
        idempotency_key: `gl-19-full-${Date.now()}`,
      },
    });
    expect(full.ok(), await full.text()).toBeTruthy();
    const fullOrder = (await full.json()) as {
      order: { id: number; tax_laar: number; total: number; subtotal_laar: number };
    };
    expect(fullOrder.order.tax_laar).toBeGreaterThan(0);

    const discounted = await request.post('/api/orders', {
      headers,
      data: {
        type: 'takeaway',
        items: [{ item_id: itemId, quantity: 2 }],
        discount_amount: 5,
        discount_reason: 'e2e-checklist-1.9',
        idempotency_key: `gl-19-disc-${Date.now()}`,
      },
    });
    expect(discounted.ok(), await discounted.text()).toBeTruthy();
    const discOrder = (await discounted.json()) as {
      order: {
        id: number;
        tax_laar: number;
        total: number;
        discount_amount: number;
        subtotal_laar: number;
      };
    };
    expect(Number(discOrder.order.discount_amount)).toBeGreaterThan(0);
    expect(
      discOrder.order.tax_laar,
      `1.9 tax on discounted (${discOrder.order.tax_laar}) must be < full (${fullOrder.order.tax_laar})`,
    ).toBeLessThan(fullOrder.order.tax_laar);

    const pay = await request.post(`/api/orders/${discOrder.order.id}/payments`, {
      headers,
      data: {
        payments: [{ method: 'cash', amount: Number(discOrder.order.total) }],
        print_receipt: false,
      },
    });
    expect(pay.ok(), `1.9 cash pay: ${await pay.text()}`).toBeTruthy();

    const show = await request.get(`/api/orders/${discOrder.order.id}`, { headers });
    expect(show.ok()).toBeTruthy();
    const paid = (await show.json()) as { order?: { tax_laar: number }; tax_laar?: number };
    const taxAfter = paid.order?.tax_laar ?? paid.tax_laar;
    expect(taxAfter).toBe(discOrder.order.tax_laar);
  });
});
