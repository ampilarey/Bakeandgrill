/**
 * Admin dashboard authentication tests.
 * Admin UI uses phone + password (not PIN numpad) and Sanctum session cookies.
 */
import { test, expect, type Page } from '@playwright/test';
import { canEstablishAdminSession } from '../fixtures/auth';
import { gotoAdminAuthenticated } from '../helpers/injectAuth';

test.describe.configure({ mode: 'serial' });

let adminAuthAvailable = false;
test.beforeAll(async ({ request }) => {
  adminAuthAvailable = await canEstablishAdminSession(request);
  if (!adminAuthAvailable) {
    console.warn('Admin login failed in beforeAll — session-based tests will skip');
  }
});

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

  test('correct credentials log in via session cookie', async ({ page }) => {
    if (!adminAuthAvailable) {
      test.skip(true, 'Admin session not available (set ADMIN_PHONE + ADMIN_PASSWORD or ADMIN_PIN)');
      return;
    }
    await gotoAdminAuthenticated(page, '/admin/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/dashboard|orders|revenue|sales/);
  });

  test('after login, sidebar nav groups are visible', async ({ page }) => {
    if (!adminAuthAvailable) {
      test.skip(true, 'Admin session not available');
      return;
    }
    await gotoAdminAuthenticated(page, '/admin/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });
    const sidebar = page.locator('nav, aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
    const navText = await sidebar.textContent() ?? '';
    expect(navText.toLowerCase()).toMatch(/orders|menu|staff|reports/);
  });

  test('admin logout clears session', async ({ page }) => {
    if (!adminAuthAvailable) {
      test.skip(true, 'Admin session not available');
      return;
    }
    await gotoAdminAuthenticated(page, '/admin/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 12_000 });

    const logoutBtn = page.getByRole('button', { name: /log out/i });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10_000 });

    const token = await page.evaluate(() => localStorage.getItem('admin_token'));
    expect(token).toBeNull();
  });
});
