/**
 * POS offline rehearsal (2026-09-03).
 *
 * The one scenario most likely to lose a sale: the iPad drops off Wi-Fi with
 * a ticket open, the cashier takes cash anyway, and the connection comes back
 * later. Until now only unit tests covered the sync engine; this drives the
 * real app through it:
 *
 *   1. Log in online so the menu, shift and staff session are cached.
 *   2. Put an item in the cart.
 *   3. Cut the network (Playwright `context.setOffline`) — the POS flips to
 *      offline mode on the browser's `offline` event.
 *   4. Charge → cash → exact → Confirm. The sale is saved locally with a
 *      device-local order number and the cart clears.
 *   5. Restore the network. The reconnect effect syncs the queue within a
 *      few seconds; the "Sync N" chip disappears and the API shows the order.
 *
 * Runs against the shared TEST server like pos-flow.spec.ts (creates one
 * paid cash order in the owner's shift). Skips, not fails, when the device
 * is pending approval or no open shift can be arranged.
 *
 * Tag: @pos-offline
 */
import { test, expect, type Page } from '@playwright/test';
import { obtainStaffToken } from '../fixtures/auth';
import { ensurePosSalesScreen, isPosWaitingForApproval } from '../helpers/assertions';

const POS_URL = '/pos/';

async function injectPosToken(page: Page): Promise<boolean> {
  const token = await obtainStaffToken(page.request);
  if (!token) return false;

  const meRes = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok()) return false;
  const meData = (await meRes.json()) as { user?: { permissions?: string[]; role?: string } };

  await page.goto(POS_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, perms, role }: { t: string; perms: string[]; role: string }) => {
      localStorage.setItem('pos_token', t);
      localStorage.setItem('pos_staff_permissions', JSON.stringify(perms));
      localStorage.setItem('pos_staff_role', role);
    },
    { t: token, perms: meData.user?.permissions ?? [], role: meData.user?.role ?? '' },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  return true;
}

/** Offline sales need a cached open shift; open one through the API if there is none. */
async function ensureOpenShift(page: Page): Promise<boolean> {
  const token = await obtainStaffToken(page.request);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const cur = await page.request.get('/api/shifts/current', { headers });
  if (cur.ok()) {
    const body = (await cur.json()) as { shift?: { id?: number } | null };
    if (body.shift?.id) return true;
  }
  const open = await page.request.post('/api/shifts/open', { headers, data: { opening_cash: 500 } });
  return open.ok();
}

test.describe('POS — offline sale then reconnect @pos-offline', () => {
  test('a cash sale taken offline syncs when the connection returns', async ({ page, context }) => {
    test.setTimeout(150_000);

    if (!(await ensureOpenShift(page))) {
      test.skip(true, 'Could not open a shift — offline sales need one cached');
      return;
    }
    if (!(await injectPosToken(page))) {
      test.skip(true, 'Could not get staff token');
      return;
    }

    const body = (await page.textContent('body')) ?? '';
    if (isPosWaitingForApproval(body)) {
      test.skip(true, 'POS device pending approval — sales UI not available');
      return;
    }

    // 1. Online: menu + shift get cached by the app while it loads.
    await ensurePosSalesScreen(page);
    const menuGrid = page.locator('.pos-menu-grid');
    await expect(menuGrid).toBeVisible({ timeout: 15_000 });
    const itemBtn = menuGrid.locator('button:not([disabled])').first();
    if ((await itemBtn.count()) === 0) {
      test.skip(true, 'No sellable items on the menu');
      return;
    }
    // Give useMenu/useShift a moment to write their caches to IndexedDB.
    await page.waitForTimeout(1_500);

    // 2. Put one item in the cart.
    await itemBtn.click();
    await expect(page.getByText('No items in ticket')).toBeHidden({ timeout: 10_000 });

    // 3. Cut the network. The POS listens for the browser's offline event.
    await context.setOffline(true);
    await expect(page.getByText(/offline mode/i).first()).toBeVisible({ timeout: 15_000 });

    // 4. Charge in cash with the exact amount.
    await page.getByRole('button', { name: /^Charge$/ }).click();
    const cashBtn = page.getByRole('button', { name: /^cash$/i }).first();
    if (await cashBtn.isVisible({ timeout: 2_000 }).catch(() => false)) await cashBtn.click();
    await page.getByTestId('charge-quick-exact').click();
    const confirm = page.locator('.pos-charge-confirm');
    await expect(confirm).toBeEnabled({ timeout: 5_000 });
    await confirm.click();

    const saved = page.getByText(/Offline sale saved \((\S+)\)/);
    await expect(saved).toBeVisible({ timeout: 15_000 });
    const localNumber = (((await saved.textContent()) ?? '').match(/Offline sale saved \((\S+)\)/) ?? [])[1];
    expect(localNumber, 'local order number in the notice').toBeTruthy();
    await expect(page.getByText('No items in ticket')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Sync 1/)).toBeVisible({ timeout: 10_000 });

    // 5. Network returns: the reconnect effect syncs after a 2 s debounce.
    await context.setOffline(false);
    await expect(page.getByText(/Synced 1 offline order/)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Sync 1/)).toBeHidden({ timeout: 10_000 });

    // The local record now carries the server's order id, and that order exists.
    const record = await page.evaluate(
      (num: string) =>
        new Promise<{ status?: string; server_order_id?: number; server_order_number?: string } | null>((resolve) => {
          const open = indexedDB.open('pos_offline_v1');
          open.onerror = () => resolve(null);
          open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction('offline_orders', 'readonly').objectStore('offline_orders').getAll();
            req.onerror = () => resolve(null);
            req.onsuccess = () => {
              const rows = req.result as Array<{ local_order_number: string; status?: string; server_order_id?: number; server_order_number?: string }>;
              resolve(rows.find((r) => r.local_order_number === num) ?? null);
            };
          };
        }),
      localNumber!,
    );
    expect(record?.status, 'local record marked synced').toBe('synced');
    expect(record?.server_order_id, 'server order id stored').toBeGreaterThan(0);

    const token = await obtainStaffToken(page.request);
    const shown = await page.request.get(`/api/orders/${record!.server_order_id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    expect(shown.ok(), `server order ${record!.server_order_id}: ${shown.status()}`).toBeTruthy();
    const shownText = await shown.text();
    if (record?.server_order_number) expect(shownText).toContain(record.server_order_number);
  });
});
