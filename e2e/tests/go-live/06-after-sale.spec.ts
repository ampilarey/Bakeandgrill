/**
 * Part 6 — after the sale (complaints / feedback / receipt).
 * LOCAL ONLY — can flag refund review (must NOT create refunds).
 * SMS suppressed via kill switch.
 */
import { test, expect } from '@playwright/test';

import {
  artisanTinker,
  createPaidOrderWithReceipt,
  staffHeaders,
} from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';
import { clearLocalRateLimiters } from '../../helpers/orderingReady';

test.describe('Part 6 — after the sale', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
    // Keep unlimited items available for paid-order fixtures
    artisanTinker(`
App\\Models\\Item::query()->where('availability_type', 'stock_based')->update(['stock_quantity' => 50]);
`);
  });

  test.beforeEach(() => {
    clearLocalRateLimiters();
  });

  test('6.2 two taps and no typing submits a complaint @checklist-6.2', async ({
    request,
    page,
  }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    await page.goto(`/receipts/${receiptToken}`, { waitUntil: 'domcontentloaded' });

    // Tap 1: open the complaint form
    const open = page.locator('[data-complaint-open]');
    await expect(open).toBeVisible({ timeout: 15_000 });
    await open.click();

    // Tap 2: pick a category (no typing) — send auto-enables
    const cat = page.locator('[data-complaint-cat]').first();
    await expect(cat).toBeVisible({ timeout: 10_000 });
    await cat.click();
    const send = page.locator('[data-complaint-send]');
    await expect(send).toBeEnabled({ timeout: 5_000 });
    await send.click();

    await expect
      .poll(async () => (await page.textContent('body')) ?? '', { timeout: 15_000 })
      .toMatch(/case|complaint|reference|thanks|received/i);
  });

  test('6.3 two categories recorded @checklist-6.3', async ({ request }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    const res = await request.post(`/api/receipts/${receiptToken}/complaints`, {
      data: {
        categories: ['food_quality', 'too_long'],
        idempotency_key: `6.3-${Date.now()}`,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = (await res.json()) as { complaint: { categories: string[] } };
    expect(body.complaint.categories).toEqual(
      expect.arrayContaining(['food_quality', 'too_long']),
    );
    expect(body.complaint.categories).toHaveLength(2);
  });

  test('6.4 billing flags refund review and creates NO refund @checklist-6.4', async ({
    request,
  }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    const res = await request.post(`/api/receipts/${receiptToken}/complaints`, {
      data: {
        categories: ['wrong_amount'],
        idempotency_key: `6.4-${Date.now()}`,
      },
    });
    const text = await res.text();
    expect(res.status(), text).toBe(201);
    const body = JSON.parse(text) as { complaint: { reference_number: string } };
    const ref = body.complaint.reference_number;
    expect(ref).toBeTruthy();

    // Public payload intentionally omits flags — assert on persisted row.
    const flags = artisanTinker(
      `$c = App\\Models\\Complaint::where('reference_number', '${ref}')->firstOrFail(); echo json_encode(['needs_refund_review' => (bool) $c->needs_refund_review, 'refund_id' => $c->refund_id]);`,
    );
    const parsed = JSON.parse(flags) as { needs_refund_review: boolean; refund_id: number | null };
    expect(parsed.needs_refund_review, '6.4 needs_refund_review').toBe(true);
    expect(parsed.refund_id, '6.4 must NOT create a refund').toBeNull();
  });

  test('6.5 food safety raises the urgent path @checklist-6.5', async ({ request }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    const res = await request.post(`/api/receipts/${receiptToken}/complaints`, {
      data: {
        categories: ['food_safety'],
        idempotency_key: `6.5-${Date.now()}`,
      },
    });
    const text = await res.text();
    expect(res.status(), text).toBe(201);
    const ref = (JSON.parse(text) as { complaint: { reference_number: string } }).complaint
      .reference_number;

    const flags = artisanTinker(
      `$c = App\\Models\\Complaint::where('reference_number', '${ref}')->firstOrFail(); echo json_encode(['is_food_safety' => (bool) $c->is_food_safety, 'id' => $c->id]);`,
    );
    const parsed = JSON.parse(flags) as { is_food_safety: boolean; id: number };
    expect(parsed.is_food_safety).toBe(true);

    const log = artisanTinker(
      `$log = App\\Models\\SmsLog::query()->where('type', 'owner_complaint_received')->where('reference_id', '${parsed.id}')->latest('id')->first(); echo $log ? (string) $log->message : '';`,
    );
    expect(log.toUpperCase()).toMatch(/URGENT/);
  });

  test('6.6 case list appears on the receipt afterwards @checklist-6.6', async ({
    request,
    page,
  }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    const res = await request.post(`/api/receipts/${receiptToken}/complaints`, {
      data: {
        categories: ['missing_item'],
        idempotency_key: `6.6-${Date.now()}`,
      },
    });
    expect(res.status()).toBe(201);
    const ref = ((await res.json()) as { complaint: { reference_number?: string } }).complaint
      .reference_number;

    await page.goto(`/receipts/${receiptToken}`, { waitUntil: 'domcontentloaded' });
    const body = (await page.textContent('body')) ?? '';
    expect(body).toMatch(/case|complaint|your reports|open cases/i);
    if (ref) expect(body).toContain(ref);
  });

  test('6.8 internal note never appears on the receipt page @checklist-6.8', async ({
    request,
    page,
  }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    const created = await request.post(`/api/receipts/${receiptToken}/complaints`, {
      data: {
        categories: ['something_else'],
        idempotency_key: `6.8-${Date.now()}`,
      },
    });
    const createdText = await created.text();
    expect(created.status(), createdText).toBe(201);
    const ref = (JSON.parse(createdText) as { complaint: { reference_number: string } }).complaint
      .reference_number;
    const complaintId = Number(
      artisanTinker(`
echo App\\Models\\Complaint::where('reference_number', '${ref}')->firstOrFail()->id;
`),
    );
    const secret = `INTERNAL-SECRET-${Date.now()}-never-public`;

    const staff = await staffHeaders(request);
    const patch = await request.patch(`/api/complaints/${complaintId}/status`, {
      headers: staff,
      data: {
        status: 'resolved',
        internal_note: secret,
        customer_reply: 'We sorted this out for you.',
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();

    await page.goto(`/receipts/${receiptToken}`, { waitUntil: 'domcontentloaded' });
    const html = (await page.content()) ?? '';
    expect(html).not.toContain(secret);
    expect(html).not.toMatch(/internal_note/);
    expect(html).toContain('We sorted this out for you.');
  });

  test('6.9 a second rating updates rather than duplicating @checklist-6.9', async ({
    request,
  }) => {
    const { receiptToken } = await createPaidOrderWithReceipt(request);
    const a = await request.post(`/api/receipts/${receiptToken}/feedback`, {
      data: { rating: 2, comments: 'meh' },
    });
    expect(a.status(), await a.text()).toBe(201);

    const b = await request.post(`/api/receipts/${receiptToken}/feedback`, {
      data: { rating: 5, comments: 'great' },
    });
    expect(b.status(), await b.text()).toBe(201);

    const c = await request.post(`/api/receipts/${receiptToken}/feedback`, {
      data: { rating: 4 },
    });
    expect(c.status()).toBe(201);

    const count = artisanTinker(
      `$r = App\\Models\\Receipt::where('token', '${receiptToken}')->firstOrFail(); echo App\\Models\\ReceiptFeedback::where('receipt_id', $r->id)->count();`,
    );
    expect(Number(count), '6.9 must be exactly one feedback row').toBe(1);
  });

  test('6.10 a foreign token reveals nothing @checklist-6.10', async ({ request, page }) => {
    const foreign = 'x'.repeat(48);
    const api = await request.get(`/api/receipts/${foreign}`);
    expect(api.status(), '6.10 API foreign token').toBe(404);

    const res = await page.goto(`/receipts/${foreign}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0).toBeGreaterThanOrEqual(400);
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/MVR\s*\d|order #|BG-\d{8}/i);
    expect(body.toLowerCase()).toMatch(/not found|invalid|expired|missing/);
  });
});
