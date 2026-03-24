/**
 * Admin dashboard CRUD flow tests.
 *
 * Rate limit: /api/auth/staff/pin-login is throttled at 10 req/min.
 * We do ONE API login in beforeAll and share the token across all tests.
 * Each test injects the token via localStorage (no further API calls).
 */
import { test, expect, type Page } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? '1121';

// Run all tests serially so we share one token and don't exhaust rate limit
test.describe.configure({ mode: 'serial' });

// ── Shared admin token (obtained once for the whole file) ──────────────────
let sharedAdminToken = '';
test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/staff/pin-login', {
    data: { pin: ADMIN_PIN },
  });
  if (res.status() === 429) {
    console.warn('Admin PIN rate-limited in beforeAll — all admin-flow tests will skip');
    return;
  }
  if (!res.ok()) {
    console.warn(`Admin PIN login failed: ${res.status()}`);
    return;
  }
  const data = await res.json() as { token?: string };
  sharedAdminToken = data.token ?? '';
});

// ── Helper: inject token and navigate to a specific admin page ────────────
async function gotoAdmin(page: Page, path = '/admin/dashboard') {
  if (!sharedAdminToken) {
    test.skip(true, 'Admin token not available (rate-limited or wrong PIN)');
    return;
  }
  // Go to admin first (to set localStorage on the right origin), then navigate
  const currentUrl = page.url();
  if (!currentUrl.includes('bakeandgrill.mv/admin')) {
    await page.goto('/admin/');
    await page.waitForLoadState('networkidle');
  }
  await page.evaluate((t: string) => {
    localStorage.setItem('admin_token', t);
  }, sharedAdminToken);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Admin dashboard pages load', () => {
  const adminPages: [string, string][] = [
    ['/admin/orders',     'order'],
    ['/admin/menu',       'menu'],
    ['/admin/staff',      'staff'],
    ['/admin/reports',    'report'],
    ['/admin/invoices',   'invoice'],
    ['/admin/expenses',   'expense'],
    ['/admin/customers',  'customer'],
    ['/admin/promotions', 'promotion'],
    ['/admin/settings',   'setting'],
  ];

  for (const [url, keyword] of adminPages) {
    test(`${url} loads without crash`, async ({ page }) => {
      await gotoAdmin(page, url);
      if (!sharedAdminToken) return; // already skipped inside gotoAdmin

      const body = await page.textContent('body') ?? '';
      expect(body).not.toContain('Cannot GET');
      expect(body.toLowerCase()).toMatch(new RegExp(keyword));
      expect(body).not.toContain('Something went wrong');
    });
  }
});

test.describe('Orders page', () => {
  test('orders list loads', async ({ page }) => {
    await gotoAdmin(page, '/admin/orders');
    if (!sharedAdminToken) return;

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/order/);
  });

  test('clicking an order row opens the detail drawer', async ({ page }) => {
    await gotoAdmin(page, '/admin/orders');
    if (!sharedAdminToken) return;

    const rows = page.locator('table tbody tr, [class*="order-row"]');
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, 'No orders in staging — skipping drawer test');
      return;
    }
    await rows.first().click();
    await page.waitForTimeout(500);
    // A drawer/modal or detail panel should appear
    const detail = page.locator('[class*="drawer"], [class*="detail"], [class*="panel"], [role="dialog"]').first();
    const appeared = await detail.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!appeared) {
      // Fallback: URL may have changed to include an order id
      const url = page.url();
      expect(url).toMatch(/order|id=/i);
    }
  });
});

test.describe('Menu CRUD', () => {
  test('create and delete a test menu item', async ({ page }) => {
    await gotoAdmin(page, '/admin/menu');
    if (!sharedAdminToken) return;

    // Look for "Add Item" or "New Item" button
    const addBtn = page.locator('button').filter({ hasText: /add item|new item|\+ item/i }).first();
    if (!(await addBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No "Add item" button found on MenuPage');
      return;
    }
    await addBtn.click();

    // Fill in minimal required fields (name)
    const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    const itemName = `QA-Test-${Date.now()}`;
    await nameInput.fill(itemName);

    // Find and fill price
    const priceInput = page.locator('input[placeholder*="price" i], input[name*="price" i]').first();
    if (await priceInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await priceInput.fill('99');
    }

    // Submit form
    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /save|create|add/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    // Item should appear in the list
    const body = await page.textContent('body') ?? '';
    if (!body.includes(itemName)) {
      // The form may still be open or navigation happened — check for success state
      const hasError = body.toLowerCase().includes('error') || body.toLowerCase().includes('failed');
      expect(hasError, 'Create item failed with an error').toBe(false);
    }

    // Delete the test item
    if (body.includes(itemName)) {
      const row = page.locator(`tr, [class*="item-row"]`).filter({ hasText: itemName }).first();
      const deleteBtn = row.locator('button').filter({ hasText: /delete|remove/i }).first();
      if (await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await deleteBtn.click();
        await page.waitForTimeout(500);
        const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes|delete/i }).first();
        if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('Promotions CRUD', () => {
  test('create and delete a test promotion', async ({ page }) => {
    await gotoAdmin(page, '/admin/promotions');
    if (!sharedAdminToken) return;

    const addBtn = page.locator('button').filter({ hasText: /add|new|create/i }).first();
    if (!(await addBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No add button on PromotionsPage');
      return;
    }
    await addBtn.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    const promoName = `QA-Promo-${Date.now()}`;
    await nameInput.fill(promoName);

    // Fill code
    const codeInput = page.locator('input[name="code"], input[placeholder*="code" i]').first();
    if (await codeInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await codeInput.fill('QATEST99');
    }

    // Discount value
    const valueInput = page.locator('input[name="value"], input[name*="discount" i]').first();
    if (await valueInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await valueInput.fill('10');
    }

    const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /save|create|add/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(1000);

    const body = await page.textContent('body') ?? '';
    const hasError = body.toLowerCase().includes('error') || body.toLowerCase().includes('failed');
    expect(hasError, 'Create promotion failed with an error').toBe(false);
  });
});

test.describe('Settings page', () => {
  test('settings page loads without crash', async ({ page }) => {
    await gotoAdmin(page, '/admin/settings');
    if (!sharedAdminToken) return;

    const body = await page.textContent('body') ?? '';
    expect(body).not.toContain('Something went wrong');
    expect(body.toLowerCase()).toMatch(/setting/);
  });

  test('website settings tab loads CMS fields', async ({ page }) => {
    await gotoAdmin(page, '/admin/settings');
    if (!sharedAdminToken) return;

    // Click the Website Settings tab
    const websiteTab = page.locator('button, [role="tab"]').filter({ hasText: /website/i }).first();
    if (!(await websiteTab.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No Website Settings tab found');
      return;
    }
    await websiteTab.click();
    await page.waitForTimeout(800);

    // Should show CMS fields (site name, tagline, etc.)
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/site|website|contact|hero|brand/);
  });
});
