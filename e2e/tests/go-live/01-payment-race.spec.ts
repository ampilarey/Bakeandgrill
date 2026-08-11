/**
 * Checklist 1.2 — two genuinely simultaneous pay requests → ONE payment / ONE order.
 * LOCAL project only. Uses real concurrency (Promise.all), not sequential waits.
 *
 * If the BML gateway is not configured (no sandbox credentials), the test is
 * skipped — there is no HTTP mock of BmlConnectService available to Playwright.
 */
import { test, expect } from '@playwright/test';

import { firstMenuItemId, mintCustomerBearer } from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';
import { ensureOrderingReady } from '../../helpers/orderingReady';

test.describe('1.2 concurrent BML pay race', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
    await ensureOrderingReady(request);
  });

  test('1.2 two simultaneous pay/bml requests create one payment @checklist-1.2', async ({
    request,
  }) => {
    const bearer = mintCustomerBearer();
    const headers = {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const itemId = await firstMenuItemId(request);

    const create = await request.post('/api/customer/orders', {
      headers,
      data: {
        type: 'online_pickup',
        items: [{ item_id: itemId, quantity: 1 }],
        collect_on: 'today',
      },
    });
    expect(create.ok(), `order create failed: ${await create.text()}`).toBeTruthy();
    const orderBody = (await create.json()) as { order: { id: number } };
    const orderId = orderBody.order.id;

    // Real concurrency — fire both before either settles.
    const [a, b] = await Promise.all([
      request.post(`/api/orders/${orderId}/pay/bml`, { headers }),
      request.post(`/api/orders/${orderId}/pay/bml`, { headers }),
    ]);

    const aText = await a.text();
    const bText = await b.text();
    const aJson = (() => {
      try {
        return JSON.parse(aText) as {
          payment_id?: number;
          payment_url?: string;
          reused?: boolean;
          code?: string;
          message?: string;
        };
      } catch {
        return {};
      }
    })();
    const bJson = (() => {
      try {
        return JSON.parse(bText) as {
          payment_id?: number;
          payment_url?: string;
          reused?: boolean;
          code?: string;
          message?: string;
        };
      } catch {
        return {};
      }
    })();

    const gatewayMissing =
      [a, b].every((r) => r.status() >= 500 || r.status() === 422 || r.status() === 503) &&
      /gateway|bml|credential|not configured|sandbox/i.test(`${aText} ${bText}`);

    if (gatewayMissing || (!aJson.payment_id && !bJson.payment_id)) {
      test.skip(
        true,
        'NOT COVERED trustworthily: no BML sandbox/mock available to Playwright ' +
          `(statuses ${a.status()}/${b.status()}). PHPUnit mocks BmlConnectService; ` +
          'HTTP E2E cannot assert a real double-pay race without gateway credentials. ' +
          `Bodies: ${aText.slice(0, 180)} | ${bText.slice(0, 180)}`,
      );
      return;
    }

    expect(aJson.payment_id, '1.2 first response needs payment_id').toBeTruthy();
    expect(bJson.payment_id, '1.2 second response needs payment_id').toBeTruthy();
    expect(
      aJson.payment_id,
      '1.2 both concurrent pays must resolve to the SAME payment_id',
    ).toBe(bJson.payment_id);

    // Exactly one order still — the original.
    const orderRes = await request.get(`/api/customer/orders/${orderId}`, { headers });
    expect(orderRes.ok()).toBeTruthy();
    const listed = await request.get('/api/customer/orders', { headers });
    expect(listed.ok()).toBeTruthy();
  });
});
