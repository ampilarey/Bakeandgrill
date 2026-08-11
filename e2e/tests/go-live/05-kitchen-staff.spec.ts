/**
 * Part 5 — kitchen + cashier permission model (5.1, 5.3, 5.4).
 *
 * Cashiers lack `admin.access`, so phone/PIN admin login is refused at the
 * auth gate (not just missing nav). That is the product’s permission model.
 */
import { test, expect } from '@playwright/test';

import {
  cashierHeaders,
  cashierToken,
  createPaidOrderWithReceipt,
  ensureCashierOpenShift,
  ensureOpenShift,
  firstMenuItemId,
  staffHeaders,
} from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';

test.describe('Part 5 — kitchen and staff', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
  });

  test('5.1 order reaches the kitchen screen @checklist-5.1', async ({ request }) => {
    await ensureOpenShift(request);
    const { orderId } = await createPaidOrderWithReceipt(request);
    const headers = await staffHeaders(request);

    await expect
      .poll(
        async () => {
          const res = await request.get('/api/kds/orders', { headers });
          if (!res.ok()) return false;
          const body = (await res.json()) as { orders?: { id: number }[] };
          return (body.orders ?? []).some((o) => o.id === orderId);
        },
        { timeout: 15_000, message: `5.1 order ${orderId} never appeared on KDS` },
      )
      .toBe(true);
  });

  test('5.3 cashier can work but cannot see reports/settings/wholesale/complaints @checklist-5.3', async ({
    request,
    page,
  }) => {
    const headers = await cashierHeaders(request);
    const me = await request.get('/api/auth/me', { headers });
    expect(me.ok()).toBeTruthy();
    const body = (await me.json()) as {
      user?: { role?: string; permissions?: string[] };
    };
    expect(body.user?.role).toBe('staff');
    const perms = body.user?.permissions ?? [];
    expect(perms).toContain('pos.ring_sales');
    expect(perms, '5.3 cashier must not have admin.access').not.toContain('admin.access');
    for (const slug of ['reports.view', 'settings.update', 'trade.view', 'complaints.view']) {
      expect(perms, `5.3 cashier must not have ${slug}`).not.toContain(slug);
    }

    // Can do the job on POS: open their shift and ring a sale.
    await ensureCashierOpenShift(request);
    const itemId = await firstMenuItemId(request);
    const create = await request.post('/api/orders', {
      headers,
      data: {
        type: 'takeaway',
        items: [{ item_id: itemId, quantity: 1 }],
        idempotency_key: `gl-53-${Date.now()}`,
      },
    });
    expect(create.ok(), `5.3 cashier ring sale: ${await create.text()}`).toBeTruthy();

    // POS shell never offers admin-only destinations.
    const token = await cashierToken(request);
    await page.goto('/pos/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ t, perms: p, r }) => {
        localStorage.setItem('pos_token', t);
        localStorage.setItem('pos_staff_permissions', JSON.stringify(p));
        localStorage.setItem('pos_staff_role', r);
      },
      { t: token, perms, r: 'staff' },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /open menu/i }).click().catch(() => {});
    const menu = (await page.textContent('body')) ?? '';
    expect(menu).not.toMatch(/\bWholesale\b/i);
    expect(menu).not.toMatch(/\bComplaints\b/i);
    expect(menu).not.toMatch(/Roles & Permissions/i);

    // Admin password login is refused (no admin.access).
    const adminLogin = await request.post('/api/auth/staff/login', {
      data: {
        phone: process.env.STAFF_PHONE ?? '7820290',
        password: process.env.STAFF_PASSWORD ?? 'password',
      },
    });
    expect(adminLogin.status()).toBe(422);
    expect(await adminLogin.text()).toMatch(/admin panel/i);
  });

  test('5.4 cashier cannot reach admin pages by URL @checklist-5.4', async ({ request, page }) => {
    // Auth gate: admin intent PIN login refused.
    const pinAdmin = await request.post('/api/auth/staff/pin-login', {
      data: {
        username: process.env.STAFF_PHONE ?? '7820290',
        pin: process.env.STAFF_PIN ?? '4444',
        intent: 'admin',
      },
    });
    expect(pinAdmin.status()).toBe(422);
    expect(await pinAdmin.text()).toMatch(/admin panel/i);

    // Deep-links without an admin session land on the sign-in wall (not the page).
    for (const path of [
      '/admin/reports',
      '/admin/settings/permissions',
      '/admin/wholesale',
      '/admin/complaints',
      '/admin/refunds',
    ]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const text = (await page.textContent('body')) ?? '';
      expect(
        /sign in|admin sign|pin|password|access denied/i.test(text),
        `5.4 ${path} must not render the protected page; got: ${text.slice(0, 200)}`,
      ).toBe(true);
      expect(text).not.toMatch(/Wholesale shops|Roles & Permissions|Profit|Complaint queue/i);
    }

    // API refuses privileged reads with a cashier POS token.
    const token = await cashierToken(request);
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    for (const url of [
      '/api/admin/trade-accounts',
      '/api/complaints',
      '/api/refunds',
    ]) {
      const res = await request.get(url, { headers });
      expect(res.status(), `5.4 ${url}`).toBeGreaterThanOrEqual(400);
      expect(res.status()).not.toBe(200);
    }
  });
});
