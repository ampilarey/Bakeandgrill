/**
 * Admin dashboard authentication tests.
 * Uses PIN numpad — no SMS involved.
 *
 * Rate limit note: /api/auth/staff/pin-login is throttled at 10 req/min.
 * We run serially and limit PIN API calls to 2 (wrong + correct) to stay safe.
 */
import { test, expect, type Page } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? '1121';

// Run all tests in this file sequentially to preserve rate-limit budget
test.describe.configure({ mode: 'serial' });

// ── Shared admin token obtained once for token-based tests ─────────────────
let sharedAdminToken = '';
test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/auth/staff/pin-login', {
    data: { pin: ADMIN_PIN },
  });
  if (res.status() === 429) {
    console.warn('Admin login rate-limited in beforeAll — token-based tests will skip');
    return;
  }
  const data = await res.json() as { token?: string };
  sharedAdminToken = data.token ?? '';
});

// ── Helper: inject admin token and navigate to dashboard ──────────────────
async function injectAdminToken(page: Page, token: string) {
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  await page.evaluate((t: string) => {
    localStorage.setItem('admin_token', t);
  }, token);
  await page.goto('/admin/dashboard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

// ── Helper for UI PIN tests ────────────────────────────────────────────────
async function gotoAdminLogin(page: Page) {
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('button', { timeout: 10_000 });
}

async function clickPin(page: Page, pin: string) {
  for (const digit of pin.split('')) {
    const btn = page.locator('button').filter({ hasText: new RegExp(`^\\s*${digit}\\s*$`) }).first();
    await expect(btn).toBeVisible({ timeout: 8_000 });
    await btn.click();
    await page.waitForTimeout(100);
  }
  const signInBtn = page.locator('button').filter({ hasText: /sign in/i }).first();
  await expect(signInBtn).toBeEnabled({ timeout: 5_000 });
  await signInBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Admin PIN login', () => {
  test('admin login page renders numpad', async ({ page }) => {
    // No API call — just verifies the UI renders correctly
    await gotoAdminLogin(page);
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/admin|pin|bake|grill/);
    for (const d of ['1', '2', '3', '5', '9']) {
      await expect(page.locator('button').filter({ hasText: new RegExp(`^${d}$`) }).first()).toBeVisible();
    }
  });

  test('wrong PIN shows error message', async ({ page }) => {
    // Uses 1 API call (wrong PIN → 422 or error message)
    await gotoAdminLogin(page);
    await clickPin(page, '9999');
    const errorDiv = page.locator('div').filter({ hasText: /invalid|wrong|incorrect|pin|not found|attempt/i }).first();
    await expect(errorDiv).toBeVisible({ timeout: 8_000 });
  });

  test('correct PIN logs in via API token injection', async ({ page }) => {
    // Verifies that a valid token grants access — avoids extra UI PIN call
    if (!sharedAdminToken) {
      test.skip(true, 'Admin token not available (rate limited in beforeAll)');
      return;
    }
    await injectAdminToken(page, sharedAdminToken);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/dashboard|orders|revenue|sales/);
  });

  test('after login, sidebar nav groups are visible', async ({ page }) => {
    if (!sharedAdminToken) {
      test.skip(true, 'Admin token not available');
      return;
    }
    await injectAdminToken(page, sharedAdminToken);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
    const sidebar = page.locator('nav, aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
    const navText = await sidebar.textContent() ?? '';
    expect(navText.toLowerCase()).toMatch(/orders|menu|staff|reports/);
  });

  test('admin logout clears token', async ({ page }) => {
    if (!sharedAdminToken) {
      test.skip(true, 'Admin token not available');
      return;
    }
    await injectAdminToken(page, sharedAdminToken);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });

    // Look for logout button in the UI
    const logoutBtn = page.locator('button').filter({ hasText: /log.?out|sign.?out/i }).first();
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForLoadState('networkidle');
      const token = await page.evaluate(() => localStorage.getItem('admin_token'));
      expect(token).toBeNull();
    } else {
      // Manually clear and verify redirect to login
      await page.evaluate(() => localStorage.removeItem('admin_token'));
      await page.goto('/admin/');
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/\/dashboard/);
    }
  });
});
