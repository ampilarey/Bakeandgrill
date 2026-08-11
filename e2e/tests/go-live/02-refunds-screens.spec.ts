/**
 * Part 2 — refund SCREENS (2.1, 2.2, 2.5).
 * API workflow is covered by RefundApprovalWorkflowTest — here we check what
 * a cashier can reach and what the UI shows.
 *
 * Note: sms_global_kill_switch aborts refund OTP and the request (422).
 * These specs stay local and rely on SMS_LIVE=false (demo) instead.
 * 2.3/2.4 skipped: OTP body is redacted in sms_logs (`[otp redacted]`).
 */
import { test, expect, type Page } from '@playwright/test';

import {
  cashierHeaders,
  cashierToken,
  createPaidOrderWithReceipt,
  disableSmsGlobalKillSwitch,
  ensureCashierOpenShift,
  ensureOpenShift,
  firstMenuItemId,
  lastRefundOtpSmsStatus,
  staffHeaders,
} from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

async function injectPosCashier(page: Page): Promise<string> {
  const token = await cashierToken(page.request);
  const me = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(me.ok()).toBeTruthy();
  const data = (await me.json()) as {
    user?: { permissions?: string[]; role?: string };
  };
  await page.goto('/pos/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, perms, r }) => {
      localStorage.setItem('pos_token', t);
      localStorage.setItem('pos_staff_permissions', JSON.stringify(perms));
      localStorage.setItem('pos_staff_role', r);
      localStorage.setItem('pos_device_id', 'POS-CASHIER-E2E');
    },
    {
      t: token,
      perms: data.user?.permissions ?? [],
      r: data.user?.role ?? 'staff',
    },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return token;
}

async function openPosRefundsTab(page: Page): Promise<void> {
  await expect
    .poll(async () => (await page.textContent('body')) ?? '', { timeout: 20_000 })
    .toMatch(/operations|sales|shift|refund/i);

  const menuBtn = page.getByRole('button', { name: /open menu/i }).first();
  if (await menuBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await menuBtn.click();
  }

  const opsBtn = page.getByRole('button', { name: /^operations$/i }).first();
  if (await opsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await opsBtn.click();
  } else {
    await page.locator('button', { hasText: /operations/i }).first().click({ timeout: 10_000 });
  }

  // Accessible name is "↩️ Refunds" — match substring, then close the drawer if open.
  const refundsTab = page.getByRole('button', { name: /refunds/i }).first();
  await expect(refundsTab).toBeVisible({ timeout: 15_000 });
  // If already on Ops with Refunds selected (auto), still click to focus.
  await refundsTab.click();
  // Close menu drawer so it doesn't intercept clicks.
  await page.keyboard.press('Escape').catch(() => {});
  await expect(page.getByRole('heading', { name: /^Refunds$/i })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe('Part 2 — refund screens', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    // Kill switch blocks OTP SMS and the refund request — use demo SMS only.
    await disableSmsGlobalKillSwitch(request);
  });

  test('2.1 cashier requests refund via POS — pending, no money moves @checklist-2.1', async ({
    request,
    page,
  }) => {
    await ensureOpenShift(request);
    await ensureCashierOpenShift(request);
    const { orderId } = await createPaidOrderWithReceipt(request);
    const headers = await staffHeaders(request);
    const before = await request.get(`/api/orders/${orderId}`, { headers });
    const beforeBody = (await before.json()) as {
      order?: { status: string; payment_status?: string };
      status?: string;
    };
    const statusBefore = beforeBody.order?.status ?? beforeBody.status;

    await injectPosCashier(page);
    await openPosRefundsTab(page);

    await page.getByPlaceholder('Order ID').fill(String(orderId));
    await page.getByPlaceholder('Amount MVR').fill('1');
    await page.locator('select').first().selectOption('wrong_item');
    await page.getByPlaceholder(/Details/i).fill('E2E checklist 2.1');
    await page.getByPlaceholder(/Walk-in phone/i).fill('+9607972434');
    await page.getByRole('button', { name: /^Request$/i }).click();

    // Confirm modal
    const confirm = page.getByRole('button', { name: /confirm|request refund|yes/i }).first();
    if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirm.click();
    }

    await expect
      .poll(async () => (await page.textContent('body')) ?? '', { timeout: 15_000 })
      .toMatch(/Refund requested|awaiting|OTP|pending/i);

    const after = await request.get(`/api/orders/${orderId}`, { headers });
    const afterBody = (await after.json()) as {
      order?: { status: string };
      status?: string;
    };
    expect(afterBody.order?.status ?? afterBody.status).toBe(statusBefore);
    expect(afterBody.order?.status ?? afterBody.status).not.toMatch(/refunded/i);

    // Approve controls must not be offered to a request-only cashier.
    await expect(page.getByRole('button', { name: /^Approve$/i })).toHaveCount(0);
  });

  test('2.2 cashier cannot approve own request — UI refuses @checklist-2.2', async ({
    request,
    page,
  }) => {
    await ensureOpenShift(request);
    await ensureCashierOpenShift(request);
    const { orderId } = await createPaidOrderWithReceipt(request);
    const ch = await cashierHeaders(request);

    // Seed a pending refund (screen setup) — then assert UI/API refuse approve.
    const created = await request.post(`/api/orders/${orderId}/refunds`, {
      headers: ch,
      data: {
        amount: 1,
        reason_category: 'wrong_item',
        reason: 'E2E checklist 2.2',
        refund_phone: '+9607972434',
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const refundId = (await created.json() as { refund: { id: number } }).refund.id;

    await injectPosCashier(page);
    await openPosRefundsTab(page);
    await expect(page.getByRole('button', { name: /^Approve$/i })).toHaveCount(0);

    // Cashiers lack admin.access — cannot open the admin Refunds approver UI at all.
    const adminLogin = await page.request.post('/api/auth/staff/login', {
      data: {
        phone: process.env.STAFF_PHONE ?? '7820290',
        password: process.env.STAFF_PASSWORD ?? 'password',
      },
    });
    expect(adminLogin.status()).toBe(422);
    expect(await adminLogin.text()).toMatch(/admin panel/i);

    // Direct approve call as cashier (what a hidden Approve button would do).
    const otpProbe = lastRefundOtpSmsStatus();
    expect(otpProbe).toMatch(/demo|disabled|queued|sent/);
    const approve = await request.post(`/api/refunds/${refundId}/approve`, {
      headers: ch,
      data: { otp: '0000' },
    });
    expect([403, 422], `2.2 approve status ${approve.status()}`).toContain(approve.status());
  });
  test('2.5 unpaid order refund refused with clear message @checklist-2.5', async ({
    request,
    page,
  }) => {
    await ensureOpenShift(request);
    await ensureCashierOpenShift(request);
    const headers = await staffHeaders(request);
    const itemId = await firstMenuItemId(request);
    const create = await request.post('/api/orders', {
      headers,
      data: {
        type: 'takeaway',
        items: [{ item_id: itemId, quantity: 1 }],
        idempotency_key: `gl-25-unpaid-${Date.now()}`,
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const orderId = (await create.json() as { order: { id: number } }).order.id;

    await injectPosCashier(page);
    await openPosRefundsTab(page);
    await page.getByPlaceholder('Order ID').fill(String(orderId));
    await page.getByPlaceholder('Amount MVR').fill('1');
    await page.locator('select').first().selectOption('wrong_item');
    await page.getByPlaceholder(/Details/i).fill('E2E unpaid refund');
    await page.getByPlaceholder(/Walk-in phone/i).fill('+9607972434');
    await page.getByRole('button', { name: /^Request$/i }).click();
    const confirm = page.getByRole('button', { name: /confirm|request refund|yes/i }).first();
    if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirm.click();
    }

    await expect
      .poll(async () => (await page.textContent('body')) ?? '', { timeout: 15_000 })
      .toMatch(/exceed|paid|unpaid|unable|refundable|0\.00/i);
  });

  test('2.3 owner OTP approve @checklist-2.3', async () => {
    test.skip(
      true,
      'OTP body is redacted in sms_logs ([otp redacted] via SmsTypeRegistry::shouldRedactBody) — cannot read the code from the local DB cleanly.',
    );
  });

  test('2.4 drawer after cash refund @checklist-2.4', async () => {
    test.skip(
      true,
      'Depends on 2.3 completing a cash refund; OTP cannot be read from sms_logs (redacted).',
    );
  });
});
