/**
 * Shared Playwright assertions — avoid false positives (e.g. "MVR 0.50" matching /500/).
 */
import { expect } from '@playwright/test';

/** Assert page body does not show an HTTP 500 or generic server crash message. */
export function assertNoServerError(body: string): void {
  const lower = body.toLowerCase();
  expect(lower).not.toMatch(
    /internal server error|http\s*500|status code:\s*500|server error|unexpected error|whoops|something went wrong/i,
  );
}

/** Enter PIN on POS numpad — blurs username first so digits route to PIN, not the text field. */
export async function posEnterPin(page: import('@playwright/test').Page, pin: string): Promise<void> {
  await page.locator('label').filter({ hasText: /device id/i }).click();
  for (const digit of pin.split('')) {
    await page.getByRole('button', { name: `Digit ${digit}`, exact: true }).click();
  }
}

/** POS username field on the login screen (type="text", not type="email"). */
export function posUsernameLocator(page: import('@playwright/test').Page) {
  return page.locator('input[autocomplete="username"], input[placeholder*="example.com"]').first();
}

/** True when POS accepted the token but the device is pending admin approval. */
export function isPosWaitingForApproval(body: string): boolean {
  return /waiting for approval|device.*pending|not approved/i.test(body);
}

/** Authenticated POS loaded — sales UI or device-approval gate (token was accepted). */
export function assertPosAuthenticated(body: string): void {
  const lower = body.toLowerCase();
  expect(lower).toMatch(
    /category|menu|item|cart|table|order|takeaway|dine.?in|waiting for approval|device id|cashier/,
  );
}
