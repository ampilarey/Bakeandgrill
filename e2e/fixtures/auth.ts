/**
 * Shared auth helpers for Playwright tests.
 * - adminLogin: clicks PIN digits on the admin numpad
 * - loadCustomerAuth: loads saved customer storageState (must exist before calling)
 */
import { type Page, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export const STORAGE_STATE_PATH = path.resolve(__dirname, '../.auth/customer.json');

const ADMIN_PIN   = process.env.ADMIN_PIN   ?? '1111';
const TEST_PHONE  = process.env.TEST_PHONE  ?? '7972434';

/** Click each digit of a PIN on the admin numpad. */
export async function adminLogin(page: Page): Promise<void> {
  await page.goto('/admin/');
  // Wait for the numpad to be visible
  await page.waitForSelector('button', { timeout: 15_000 });

  for (const digit of ADMIN_PIN.split('')) {
    // Numpad buttons contain a single digit text
    await page.locator(`button`).filter({ hasText: new RegExp(`^${digit}$`) }).first().click();
  }

  // After entering PIN, dashboard should load
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/** Returns true if the customer auth storage state file already exists. */
export function customerAuthExists(): boolean {
  return fs.existsSync(STORAGE_STATE_PATH);
}

/** Returns the phone number used for testing. */
export function testPhone(): string {
  return TEST_PHONE;
}
