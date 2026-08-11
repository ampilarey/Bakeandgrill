/**
 * Shared API helpers for go-live Playwright specs.
 * Uses existing auth fixtures — does not invent a second auth system.
 */
import { expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';

import { obtainStaffToken } from '../fixtures/auth';

const BACKEND = path.resolve(__dirname, '../../backend');

/** Run `php artisan tinker --execute=…` without a shell (so `$vars` are not expanded). */
export function artisanTinker(php: string): string {
  const out = execFileSync('php', ['artisan', 'tinker', `--execute=${php}`], {
    cwd: BACKEND,
    encoding: 'utf8',
  });
  return out.trim().split('\n').filter(Boolean).pop() ?? '';
}

export async function staffHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const token = await obtainStaffToken(request);
  expect(token, 'staff bearer required').not.toBe('');
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/** Cashier (staff role) bearer — for blind close assertions. */
export async function cashierToken(request: APIRequestContext): Promise<string> {
  const pin = process.env.STAFF_PIN ?? '4444';
  const username = process.env.STAFF_PHONE ?? '7820290';
  const res = await request.post('/api/auth/staff/pin-login', {
    data: { username, pin },
  });
  expect(res.ok(), `cashier login failed: ${await res.text()}`).toBeTruthy();
  const data = (await res.json()) as { token?: string };
  return data.token ?? '';
}

export async function cashierHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const token = await cashierToken(request);
  expect(token, 'cashier bearer required').not.toBe('');
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/** Open shift for the cashier (refunds require THEIR open shift). */
export async function ensureCashierOpenShift(request: APIRequestContext): Promise<number> {
  const headers = await cashierHeaders(request);
  const cur = await request.get('/api/shifts/current', { headers });
  if (cur.ok()) {
    const body = (await cur.json()) as { shift?: { id?: number } | null };
    if (body.shift?.id) return body.shift.id;
  }
  const open = await request.post('/api/shifts/open', {
    headers,
    data: { opening_cash: 100 },
  });
  expect(open.ok(), `cashier open shift failed: ${await open.text()}`).toBeTruthy();
  const data = (await open.json()) as { shift: { id: number } };
  return data.shift.id;
}

/**
 * Refund OTP bodies are redacted in sms_logs (`[otp redacted]`).
 * Returns the latest log status for assertions that a send was attempted.
 */
export function lastRefundOtpSmsStatus(): string {
  return artisanTinker(`
$m = App\\Models\\SmsLog::where('type', 'customer_refund_otp')->latest('id')->first();
echo $m ? ($m->status.'|'.$m->message) : 'NONE';
`);
}

/**
 * Kill switch aborts refund OTP and the request itself (422).
 * Refund screen specs rely on SMS_LIVE=false (demo) instead — disable the switch.
 */
export async function disableSmsGlobalKillSwitch(request: APIRequestContext): Promise<void> {
  const token = await obtainStaffToken(request);
  expect(token).not.toBe('');
  const res = await request.patch('/api/admin/sms/global-kill-switch', {
    headers: { Authorization: `Bearer ${token}` },
    data: { enabled: false },
  });
  expect(res.ok(), `disable kill switch: ${await res.text()}`).toBeTruthy();
}

/** Mint a customer Sanctum PAT via artisan (local DB only). */
export function mintCustomerBearer(phone = '+9607972434'): string {
  const token = artisanTinker(`
$c = App\\Models\\Customer::where('phone', '${phone}')->firstOrFail();
echo $c->createToken('e2e-race', ['customer'])->plainTextToken;
`);
  if (!token.includes('|')) {
    throw new Error(`mintCustomerBearer failed — output: ${token}`);
  }
  return token;
}

export async function firstMenuItemId(_request: APIRequestContext): Promise<number> {
  // Public items payload omits track_stock / availability_type — pick from DB.
  const id = Number(
    artisanTinker(`
$i = App\\Models\\Item::query()->where('is_active', true)->where('availability_type', 'always')->orderBy('id')->first();
if (!$i) { $i = App\\Models\\Item::query()->where('is_active', true)->where('availability_type', '!=', 'stock_based')->orderBy('id')->firstOrFail(); }
echo $i->id;
`),
  );
  expect(id, 'need at least one unlimited menu item').toBeGreaterThan(0);
  return id;
}

/**
 * Ensure at least one stock_based prepared-stock item exists (local seed often
 * imports menu items as availability_type=always).
 */
export async function ensurePreparedStockItem(
  request: APIRequestContext,
  stock = 5,
): Promise<{ item_id: number; stock: number }> {
  const headers = await staffHeaders(request);
  const list = await request.get('/api/prepared-stock', { headers });
  expect(list.ok(), await list.text()).toBeTruthy();
  const rows = (await list.json()) as { items?: { item_id: number; stock: number }[] };
  const items = rows.items ?? [];

  const itemId =
    items[0]?.item_id ??
    Number(
      artisanTinker(`
$i = App\\Models\\Item::query()->where('is_active', true)->orderBy('id')->skip(1)->first()
    ?? App\\Models\\Item::query()->where('is_active', true)->firstOrFail();
$i->track_stock = true;
$i->availability_type = 'stock_based';
$i->is_available = true;
$i->save();
echo $i->id;
`),
    );

  // Clear stale reservations so "available" matches stock_quantity for races.
  artisanTinker(`
\\Illuminate\\Support\\Facades\\DB::table('stock_reservations')->where('item_id', ${itemId})->delete();
$i = App\\Models\\Item::findOrFail(${itemId});
$i->track_stock = true;
$i->availability_type = 'stock_based';
$i->stock_quantity = ${stock};
$i->is_available = true;
$i->save();
echo $i->stock_quantity;
`);
  return { item_id: itemId, stock };
}

/** Ensure an open shift exists (owner). Returns shift id. */
export async function ensureOpenShift(request: APIRequestContext): Promise<number> {
  const headers = await staffHeaders(request);
  const cur = await request.get('/api/shifts/current', { headers });
  if (cur.ok()) {
    const body = (await cur.json()) as { shift?: { id?: number } | null };
    if (body.shift?.id) return body.shift.id;
  }
  const open = await request.post('/api/shifts/open', {
    headers,
    data: { opening_cash: 500 },
  });
  expect(open.ok(), `open shift failed: ${await open.text()}`).toBeTruthy();
  const data = (await open.json()) as { shift: { id: number } };
  return data.shift.id;
}

/** Staff POS paid cash order + receipt token — for complaint/feedback specs. */
export async function createPaidOrderWithReceipt(
  request: APIRequestContext,
  opts: { itemId?: number } = {},
): Promise<{ orderId: number; receiptToken: string; receiptUrl: string }> {
  const headers = await staffHeaders(request);
  await ensureOpenShift(request);
  const itemId = opts.itemId ?? (await firstMenuItemId(request));

  const create = await request.post('/api/orders', {
    headers,
    data: {
      type: 'takeaway',
      items: [{ item_id: itemId, quantity: 1 }],
      idempotency_key: `gl-paid-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
  });
  expect(create.ok(), `create order failed: ${await create.text()}`).toBeTruthy();
  const order = (await create.json()) as { order?: { id: number; total?: number }; id?: number; total?: number };
  const orderId = order.order?.id ?? order.id;
  const total = Number(order.order?.total ?? order.total ?? 0);
  expect(orderId).toBeTruthy();

  const amount = Number.isFinite(total) && total > 0 ? Number(Number(total).toFixed(2)) : 0;
  const pay = await request.post(`/api/orders/${orderId}/payments`, {
    headers,
    data: {
      payments: [{ method: 'cash', amount }],
      print_receipt: false,
    },
  });
  expect(pay.ok(), `pay order failed: ${await pay.text()}`).toBeTruthy();

  const link = await request.get(`/api/orders/${orderId}/receipt-link`, { headers });
  expect(link.ok(), `receipt-link failed: ${await link.text()}`).toBeTruthy();
  const linkBody = (await link.json()) as { link?: string; token?: string };
  const receiptUrl = linkBody.link ?? '';
  const receiptToken =
    linkBody.token ??
    (receiptUrl.includes('/receipts/') ? receiptUrl.split('/receipts/')[1]?.split(/[?#]/)[0] : '');
  expect(receiptToken, 'receipt token missing').toBeTruthy();

  return { orderId: orderId as number, receiptToken: receiptToken as string, receiptUrl };
}
