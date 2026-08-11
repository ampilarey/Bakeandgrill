/**
 * Checklist 4.9 — two concurrent orders for the last unit; exactly one succeeds.
 * Real concurrency via Promise.all. LOCAL ONLY (moves stock).
 */
import { test, expect } from '@playwright/test';

import {
  artisanTinker,
  ensurePreparedStockItem,
  mintCustomerBearer,
} from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';
import { ensureOrderingReady } from '../../helpers/orderingReady';

test.describe('4.9 concurrent last-unit race', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
    await ensureOrderingReady(request);
  });

  test('4.9 two concurrent last-unit orders — exactly one wins @checklist-4.9', async ({
    request,
  }) => {
    const prepared = await ensurePreparedStockItem(request, 1);
    const itemId = prepared.item_id;

    // Two distinct customer bearers so auth isn't a single-session serialiser.
    const aBearer = mintCustomerBearer('+9607972434');
    const phoneB = '+9607972435';
    artisanTinker(`
$c = App\\Models\\Customer::firstOrNew(['phone' => '${phoneB}']);
$c->name = 'E2E Race B';
$c->is_active = true;
$c->password = bcrypt('password123');
$c->save();
`);
    const bBearer = mintCustomerBearer(phoneB);

    const payload = {
      type: 'online_pickup',
      items: [{ item_id: itemId, quantity: 1 }],
      collect_on: 'today',
    };

    const [ra, rb] = await Promise.all([
      request.post('/api/customer/orders', {
        headers: { Authorization: `Bearer ${aBearer}`, Accept: 'application/json' },
        data: payload,
      }),
      request.post('/api/customer/orders', {
        headers: { Authorization: `Bearer ${bBearer}`, Accept: 'application/json' },
        data: payload,
      }),
    ]);

    const statuses = [ra.status(), rb.status()].sort();
    const texts = [await ra.text(), await rb.text()];
    const wins = [ra.status(), rb.status()].filter((s) => s === 201).length;
    const losses = [ra.status(), rb.status()].filter((s) => s === 422).length;

    expect(
      wins,
      `4.9 expected exactly one 201 win; statuses=${statuses} bodies=${texts.join(' || ').slice(0, 400)}`,
    ).toBe(1);
    expect(
      losses,
      `4.9 expected exactly one 422 loss; statuses=${statuses} bodies=${texts.join(' || ').slice(0, 400)}`,
    ).toBe(1);
  });
});
