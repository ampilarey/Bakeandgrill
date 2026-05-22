/**
 * Shared auth helpers for Playwright tests.
 */
import { type Page, expect } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE_PATH = path.resolve(__dirname, '../.auth/customer.json');

/** PIN used for KDS/POS staff API login when password is unavailable. */
export const ADMIN_PIN = process.env.ADMIN_PIN ?? '1121';

const ADMIN_PHONE    = process.env.ADMIN_PHONE    ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const TEST_PHONE     = process.env.TEST_PHONE     ?? '7972434';

/** Sign in to admin via phone + password form. Requires ADMIN_PHONE and ADMIN_PASSWORD in e2e/.env.test */
export async function adminLogin(page: Page): Promise<void> {
  if (!ADMIN_PHONE || !ADMIN_PASSWORD) {
    throw new Error('adminLogin requires ADMIN_PHONE and ADMIN_PASSWORD in e2e/.env.test');
  }
  await page.goto('/admin/');
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder*="+960"], input[placeholder*="7XX"]').first().fill(ADMIN_PHONE);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

export function testPhone(): string {
  return TEST_PHONE;
}
