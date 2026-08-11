/**
 * Part 7 — wholesale rehearsal as ONE ordered scenario (7.1–7.9).
 * LOCAL ONLY — moves stock, raises invoices, records payments.
 */
import { test, expect } from '@playwright/test';

import {
  artisanTinker,
  ensureOpenShift,
  firstMenuItemId,
  staffHeaders,
} from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';

const tinker = artisanTinker;

test.describe('Part 7 — wholesale rehearsal (ordered scenario)', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
    // GST seller identity required before trade invoices post tax ledger rows.
    tinker(`
\\App\\Models\\GstSetting::query()->updateOrCreate(['id' => 1], [
  'seller_tin' => 'TIN-E2E',
  'taxable_activity_no' => 'TA-E2E',
  'seller_name' => 'Bake & Grill',
  'default_tax_rate_bp' => 800,
  'tax_inclusive' => true,
  'accounting_basis' => 'invoice',
  'invoice_prefix' => 'TI',
  'credit_note_prefix' => 'CN',
  'next_invoice_sequence' => 1,
  'next_credit_note_sequence' => 1,
]);
echo 'gst-ok';
`);
  });

  test('7.1–7.9 account → dispatch → stock → reconcile → mismatch → invoice → part pay → P&L @checklist-7', async ({
    request,
  }) => {
    const headers = await staffHeaders(request);
    await ensureOpenShift(request);

    const customerId = Number(
      tinker(`
$c = App\\Models\\Customer::firstOrNew(['phone' => '+9607711223']);
$c->name = 'Island Mart E2E';
$c->tin = 'C123456';
$c->billing_address = 'Male';
$c->is_active = true;
$c->credit_enabled = true;
$c->credit_status = 'active';
$c->credit_limit_laar = 5_000_000;
$c->credit_balance_laar = 0;
$c->credit_payment_terms_days = 30;
$c->save();
echo $c->id;
`),
    );
    expect(customerId).toBeGreaterThan(0);

    // 7.1 account + prices (reuse if a previous local run already linked this customer)
    let tradeAccountId = Number(
      tinker(`
$a = App\\Models\\TradeAccount::where('customer_id', ${customerId})->first();
echo $a?->id ?? 0;
`),
    );
    if (!tradeAccountId) {
      const acctRes = await request.post('/api/admin/trade-accounts', {
        headers,
        data: {
          customer_id: customerId,
          shop_name: `Island Mart E2E ${Date.now()}`,
          contact_phone: '+9607711223',
          missing_policy: 'charge',
          settlement_mode: 'sale_or_return',
          payment_terms_days: 14,
        },
      });
      const acctText = await acctRes.text();
      expect(acctRes.ok(), `7.1 create account: ${acctText}`).toBeTruthy();
      const acctJson = JSON.parse(acctText) as {
        account?: { id: number };
        trade_account?: { id: number };
        data?: { id: number };
        id?: number;
      };
      tradeAccountId =
        acctJson.account?.id ?? acctJson.trade_account?.id ?? acctJson.data?.id ?? acctJson.id ?? 0;
    }
    expect(tradeAccountId, '7.1 trade account id').toBeTruthy();

    const itemId = await firstMenuItemId(request);
    tinker(`
$i = App\\Models\\Item::findOrFail(${itemId});
$i->track_stock = true;
$i->availability_type = 'stock_based';
$i->stock_quantity = 100;
$i->is_active = true;
$i->is_available = true;
$i->save();
`);

    const price = await request.post(`/api/admin/trade-accounts/${tradeAccountId}/prices`, {
      headers,
      data: { item_id: itemId, price_laar: 5000, is_active: true },
    });
    expect(price.ok(), `7.1 price: ${await price.text()}`).toBeTruthy();

    // 7.2 dispatch
    const dispatch = await request.post('/api/trade/deliveries/dispatch', {
      headers,
      data: {
        trade_account_id: tradeAccountId,
        idempotency_key: `d-${Date.now()}`,
        lines: [{ item_id: itemId, qty: 10 }],
      },
    });
    expect(dispatch.status(), `7.2 dispatch: ${await dispatch.text()}`).toBe(201);
    const delivery = (await dispatch.json()) as {
      delivery: { id: number; lines: { id: number; item_id: number }[] };
    };
    const deliveryId = delivery.delivery.id;
    const lineId = delivery.delivery.lines[0].id;

    // 7.3 stock gone / reduced after dispatch
    const stockAfter = Number(
      tinker(`echo (int) App\\Models\\Item::findOrFail(${itemId})->stock_quantity;`),
    );
    expect(stockAfter, '7.3 stock must drop after dispatch').toBeLessThan(100);

    // 7.4 reconcile good returns
    const reconcileOk = await request.post(`/api/trade/deliveries/${deliveryId}/reconcile`, {
      headers,
      data: {
        lines: [
          {
            line_id: lineId,
            reported_sold_qty: 8,
            counted_return_qty: 2,
            qty_missing: 0,
            return_action: 'accept_to_stock',
            return_condition: 'good',
            return_idempotency_key: `r-good-${Date.now()}`,
          },
        ],
      },
    });
    expect(reconcileOk.ok(), `7.4 good reconcile: ${await reconcileOk.text()}`).toBeTruthy();

    // Spoiled / waste returns on a second delivery
    const d2 = await request.post('/api/trade/deliveries/dispatch', {
      headers,
      data: {
        trade_account_id: tradeAccountId,
        idempotency_key: `d-spoil-${Date.now()}`,
        lines: [{ item_id: itemId, qty: 5 }],
      },
    });
    expect(d2.status(), await d2.text()).toBe(201);
    const del2 = (await d2.json()) as {
      delivery: { id: number; lines: { id: number }[] };
    };
    const spoilRec = await request.post(`/api/trade/deliveries/${del2.delivery.id}/reconcile`, {
      headers,
      data: {
        lines: [
          {
            line_id: del2.delivery.lines[0].id,
            reported_sold_qty: 3,
            counted_return_qty: 2,
            qty_missing: 0,
            return_action: 'reject_to_waste',
            return_condition: 'damaged',
            return_idempotency_key: `r-spoil-${Date.now()}`,
          },
        ],
      },
    });
    expect(spoilRec.ok(), `7.4 spoiled reconcile: ${await spoilRec.text()}`).toBeTruthy();

    // 7.5 deliberate mismatch blocks invoicing
    const d3 = await request.post('/api/trade/deliveries/dispatch', {
      headers,
      data: {
        trade_account_id: tradeAccountId,
        idempotency_key: `d-mm-${Date.now()}`,
        lines: [{ item_id: itemId, qty: 10 }],
      },
    });
    expect(d3.status()).toBe(201);
    const del3 = (await d3.json()) as {
      delivery: { id: number; lines: { id: number }[] };
    };
    await request.post(`/api/trade/deliveries/${del3.delivery.id}/reconcile`, {
      headers,
      data: {
        lines: [
          {
            line_id: del3.delivery.lines[0].id,
            reported_sold_qty: 8,
            counted_return_qty: 1,
            qty_missing: 1,
            return_action: 'accept_to_stock',
            return_condition: 'good',
            return_idempotency_key: `r-mm-${Date.now()}`,
          },
        ],
      },
    });

    const blocked = await request.post(`/api/admin/trade-accounts/${tradeAccountId}/invoices`, {
      headers,
      data: {
        delivery_ids: [del3.delivery.id],
        idempotency_key: `inv-mm-${Date.now()}`,
      },
    });
    expect(blocked.status(), '7.5 mismatch must block invoice').toBe(422);
    expect(await blocked.text()).toMatch(/mismatch/i);

    // 7.6 resolve mismatch then invoice
    const resolved = await request.post(
      `/api/trade/deliveries/${del3.delivery.id}/resolve-mismatch`,
      {
        headers,
        data: { decision: 'E2E accept shop report' },
      },
    );
    expect(resolved.ok(), `7.6 resolve: ${await resolved.text()}`).toBeTruthy();

    const inv = await request.post(`/api/admin/trade-accounts/${tradeAccountId}/invoices`, {
      headers,
      data: {
        delivery_ids: [deliveryId, del3.delivery.id],
        idempotency_key: `inv-ok-${Date.now()}`,
      },
    });
    expect(inv.status(), `7.6 invoice: ${await inv.text()}`).toBe(201);
    const invoice = (await inv.json()) as {
      invoice: { id: number; total_laar: number };
    };
    expect(invoice.invoice.total_laar).toBeGreaterThan(0);

    // 7.7 part payment
    const part = Math.floor(invoice.invoice.total_laar / 2);
    const pay = await request.post(`/api/admin/trade-accounts/${tradeAccountId}/payments`, {
      headers,
      data: {
        customer_id: customerId,
        amount_laar: part,
        method: 'cash',
        idempotency_key: `pay-${Date.now()}`,
        invoice_ids: [invoice.invoice.id],
      },
    });
    expect(pay.ok(), `7.7 part payment: ${await pay.text()}`).toBeTruthy();

    // 7.8 wholesale revenue appears separately in P&L
    const today = new Date().toISOString().slice(0, 10);
    const pnl = await request.get(
      `/api/reports/finance/profit-and-loss?from=${today}&to=${today}`,
      { headers },
    );
    expect(pnl.ok(), `7.8 P&L: ${await pnl.text()}`).toBeTruthy();
    const pnlBody = await pnl.text();
    expect(pnlBody).toMatch(/wholesale/i);
    const pnlJson = JSON.parse(pnlBody) as {
      revenue?: { wholesale?: number | string };
      wholesale?: number | string;
    };
    const wholesale = Number(pnlJson.revenue?.wholesale ?? pnlJson.wholesale ?? NaN);
    expect(
      Number.isFinite(wholesale) && wholesale > 0,
      `7.8 wholesale revenue must be > 0, got ${wholesale} from ${pnlBody.slice(0, 300)}`,
    ).toBeTruthy();

    // 7.9 dispatch beyond credit limit refused
    tinker(`
$c = App\\Models\\Customer::findOrFail(${customerId});
$c->credit_limit_laar = 1;
$c->credit_balance_laar = 0;
$c->save();
echo 'limit-1';
`);
    const over = await request.post('/api/trade/deliveries/dispatch', {
      headers,
      data: {
        trade_account_id: tradeAccountId,
        idempotency_key: `over-limit-${Date.now()}`,
        lines: [{ item_id: itemId, qty: 5 }],
      },
    });
    expect(over.status(), `7.9 over-limit dispatch: ${await over.text()}`).toBe(422);
    expect(await over.text()).toMatch(/credit|limit|owed|held/i);
  });
});
