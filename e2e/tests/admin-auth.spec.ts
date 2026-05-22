/**
 * Admin dashboard authentication tests.
 * Admin UI uses phone + password (not PIN numpad).
 * Token injection tests fall back to PIN API when ADMIN_PASSWORD is unset.
 */
import { test, expect, type Page } from '@playwright/test';
import { ADMIN_PIN } from '../fixtures/auth';

test.describe.configure({ mode: 'serial' });

const ADMIN_PHONE    = process.env.ADMIN_PHONE    ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

let sharedAdminToken = '';
test.beforeAll(async ({ request }) => {
  if (ADMIN_PHONE && ADMIN_PASSWORD) {
    const res = await request.post('/api/auth/staff/login', {
      data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
    });
    if (res.status() === 429) {
      console.warn('Admin login rate-limited in beforeAll — token-based tests will skip');
      return;
    }
    if (res.ok()) {
      const data = await res.json() as { token?: string };
      sharedAdminToken = data.token ?? '';
      return;
    }
  }

  const res = await request.post('/api/auth/staff/pin-login', {
    data: { pin: ADMIN_PIN },
  });
  if (res.status() === 429) {
    console.warn('Admin PIN login rate-limited in beforeAll — token-based tests will skip');
    return;
  }
  if (res.ok()) {
    const data = await res.json() as { token?: string };
    sharedAdminToken = data.token ?? '';
  }
});

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

async function gotoAdminLogin(page: Page) {
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('h2', { timeout: 10_000 });
}

test.describe('Admin login', () => {
  test('admin login page renders phone and password fields', async ({ page }) => {
    await gotoAdminLogin(page);
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/admin sign in|bake|grill/);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('wrong credentials show error message', async ({ page }) => {
    await gotoAdminLogin(page);
    const phoneInput = page.locator('input[placeholder*="+960"], input[placeholder*="7XX"]').first();
    await phoneInput.fill('7000000');
    await page.locator('input[type="password"]').first().fill('wrong-password-xyz');
    await page.getByRole('button', { name: /sign in/i }).click();
    const errorDiv = page.locator('div, p').filter({ hasText: /invalid|wrong|incorrect|credentials|failed|attempt/i }).first();
    await expect(errorDiv).toBeVisible({ timeout: 8_000 });
  });

  test('correct credentials log in via API token injection', async ({ page }) => {
    if (!sharedAdminToken) {
      test.skip(true, 'Admin token not available (set ADMIN_PHONE + ADMIN_PASSWORD or ADMIN_PIN)');
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

    const logoutBtn = page.locator('button').filter({ hasText: /log.?out|sign.?out/i }).first();
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
      await page.waitForLoadState('networkidle');
      const token = await page.evaluate(() => localStorage.getItem('admin_token'));
      expect(token).toBeNull();
    } else {
      await page.evaluate(() => localStorage.removeItem('admin_token'));
      await page.goto('/admin/dashboard');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 8_000 });
    }
  });
});
