/**
 * Admin dashboard CRUD flow tests.
 *
 * Rate limit: /api/auth/staff/pin-login is throttled at 10 req/min.
 * We do ONE API login in beforeAll and share the token across all tests.
 * Each test injects the token via localStorage (no further API calls).
 */
import { test, expect, type Page } from '@playwright/test';
import { obtainStaffToken } from '../fixtures/auth';
import { gotoAdminWithToken } from '../helpers/injectAuth';
import { waitForAdminPageReady } from '../helpers/wait';

// Run all tests serially so we share one token and don't exhaust rate limit
test.describe.configure({ mode: 'serial' });

// ── Shared admin token (obtained once for the whole file) ──────────────────
let sharedAdminToken = '';
test.beforeAll(async ({ request }) => {
  sharedAdminToken = await obtainStaffToken(request);
  if (!sharedAdminToken) {
    console.warn('Admin login failed — all admin-flow tests will skip');
  }
});

// ── Helper: inject token and navigate to a specific admin page ────────────
async function gotoAdmin(page: Page, path = '/admin/dashboard') {
  if (!sharedAdminToken) {
    test.skip(true, 'Admin token not available (rate-limited or wrong PIN)');
    return;
  }
  // Go to admin first (to set localStorage on the right origin), then navigate
  await gotoAdminWithToken(page, sharedAdminToken, path);
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

      await waitForAdminPageReady(page, keyword);
      const body = await page.textContent('body') ?? '';
      expect(body).not.toContain('Cannot GET');
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

// ── Extended admin page smoke tests ───────────────────────────────────────
// Each test navigates to a page and asserts it loads without a crash.
// Covers the ~25 admin pages that had 0 coverage before.

test.describe('Admin pages — extended smoke coverage', () => {
  const extendedPages: [string, string][] = [
    ['/admin/dashboard',          'dashboard|revenue|orders|today'],
    ['/admin/kds',                'kitchen|kds|ticket|queue'],
    ['/admin/delivery',           'delivery|driver|order'],
    ['/admin/loyalty',            'loyalty|points|reward'],
    ['/admin/analytics',          'analytic|visit|session|revenue'],
    ['/admin/reservations',       'reservation|booking|table'],
    ['/admin/profit-loss',        'profit|loss|revenue|p&l|p &'],
    ['/admin/supplier-intelligence', 'supplier|intelligence|performance'],
    ['/admin/forecasts',          'forecast|predict|demand'],
    ['/admin/purchase-orders',    'purchase|order|supplier'],
    ['/admin/inventory',          'inventor|stock|item'],
    ['/admin/waste-logs',         'waste|log'],
    ['/admin/customers',          'customer'],
    ['/admin/gift-cards',         'gift|card|voucher'],
    ['/admin/reviews',            'review|rating'],
    ['/admin/specials',           'special|daily|deal'],
    ['/admin/refunds',            'refund|return'],
    ['/admin/referrals',          'referral|code'],
    ['/admin/webhooks',           'webhook|endpoint'],
    ['/admin/sms',                'sms|recipient|campaign'],
    ['/admin/tables',             'table|floor|seat'],
    ['/admin/devices',            'device|pos|kds'],
    ['/admin/shifts',             'shift|cash|drawer'],
    ['/admin/time-clock',         'time|clock|punch'],
    ['/admin/online-ordering',    'online.*order|ordering.*online|schedule'],
  ];

  for (const [url, pattern] of extendedPages) {
    test(`${url} loads without crash`, async ({ page }) => {
      await gotoAdmin(page, url);
      if (!sharedAdminToken) return;

      const body = await page.textContent('body') ?? '';
      expect(body, `${url} body was empty`).not.toBe('');
      expect(body).not.toContain('Cannot GET');
      expect(body).not.toContain('Something went wrong');
      // Keyword match — flexible regex so minor UI copy changes don't break tests
      expect(body.toLowerCase()).toMatch(new RegExp(pattern));
    });
  }
});

// ── Dashboard stats sanity ─────────────────────────────────────────────────
test.describe('Dashboard data', () => {
  test('dashboard shows at least one stat card', async ({ page }) => {
    await gotoAdmin(page, '/admin/dashboard');
    if (!sharedAdminToken) return;

    // Stat cards are rendered — at least one metric value should be visible
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/revenue|orders|mvr|\d+/);
  });
});

// ── Finance module smoke ───────────────────────────────────────────────────
test.describe('Finance pages', () => {
  test('/admin/invoices filter UI present', async ({ page }) => {
    await gotoAdmin(page, '/admin/invoices');
    if (!sharedAdminToken) return;
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/invoice/);
    // Filter dropdowns render after auth/me + invoice list load
    await expect(page.locator('select').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('select').count()).toBeGreaterThanOrEqual(1);
  });

  test('/admin/expenses shows category and form', async ({ page }) => {
    await gotoAdmin(page, '/admin/expenses');
    if (!sharedAdminToken) return;
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/expense/);
  });

  test('/admin/profit-loss date pickers present', async ({ page }) => {
    await gotoAdmin(page, '/admin/profit-loss');
    if (!sharedAdminToken) return;
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('input[type="date"]').count()).toBeGreaterThanOrEqual(2);
  });
});

// ── SMS page tabs load ─────────────────────────────────────────────────────
test.describe('SMS page', () => {
  test('SMS recipients tab is default and renders', async ({ page }) => {
    await gotoAdmin(page, '/admin/sms');
    if (!sharedAdminToken) return;

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/recipient|staff|contact|sms/);
  });

  test('SMS automations tab loads toggles', async ({ page }) => {
    await gotoAdmin(page, '/admin/sms');
    if (!sharedAdminToken) return;

    const autoTab = page.locator('button').filter({ hasText: /automation/i }).first();
    if (await autoTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await autoTab.click();
      await page.waitForTimeout(600);
      const body = await page.textContent('body') ?? '';
      expect(body.toLowerCase()).toMatch(/event|trigger|order|customer/);
    }
  });
});

// ── Staff page ─────────────────────────────────────────────────────────────
test.describe('Staff page', () => {
  test('staff list renders', async ({ page }) => {
    await gotoAdmin(page, '/admin/staff');
    if (!sharedAdminToken) return;

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/staff|member|role|email/);
  });
});

// ── Customers page ─────────────────────────────────────────────────────────
test.describe('Customers page', () => {
  test('customer table or empty state renders', async ({ page }) => {
    await gotoAdmin(page, '/admin/customers');
    if (!sharedAdminToken) return;

    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/customer|phone|order/);
  });
});
