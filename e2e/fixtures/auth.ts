/**
 * Shared auth helpers for Playwright tests.
 */
import { type APIRequestContext, type Page, expect } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE_PATH = path.resolve(__dirname, '../.auth/customer.json');

/** PIN used for KDS/POS staff API login when password is unavailable. */
export const ADMIN_PIN = process.env.ADMIN_PIN ?? '1121';

/** Staff username for PIN login (phone or email). Required since pin-login API change. */
export const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '';

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
export const TEST_PHONE     = process.env.TEST_PHONE     ?? '7972434';
export const TEST_PASSWORD  = process.env.TEST_PASSWORD  ?? '';

/** Payload for POST /api/auth/staff/pin-login */
export function staffPinLoginBody(pin?: string) {
  const username = ADMIN_PHONE || process.env.ADMIN_USERNAME || '7820288';
  return { username, pin: pin ?? ADMIN_PIN };
}

/** Obtain a staff token — prefers phone+password login to avoid PIN rate limits. */
export async function obtainStaffToken(request: APIRequestContext): Promise<string> {
  if (ADMIN_PHONE && ADMIN_PASSWORD) {
    const res = await request.post('/api/auth/staff/login', {
      data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
    });
    if (res.ok()) {
      const data = (await res.json()) as { token?: string };
      return data.token ?? '';
    }
  }

  const res = await request.post('/api/auth/staff/pin-login', {
    data: staffPinLoginBody(),
  });
  if (res.ok()) {
    const data = (await res.json()) as { token?: string };
    return data.token ?? '';
  }
  return '';
}

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
