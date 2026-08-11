/**
 * Reliable wait helpers — prefer these over fixed waitForTimeout / networkidle.
 */
import { expect, type Page } from '@playwright/test';

/**
 * Customer session is live — header shows the expected local phone digits.
 * Order app uses Sanctum session cookies (not localStorage bearer tokens).
 */
export async function waitForCustomerSession(page: Page, phone: string, timeout = 20_000): Promise<void> {
  const local = phone.replace(/^\+?960/, '');
  await page.waitForFunction(
    (expectedPhone) => {
      const header = document.querySelector('header');
      return header?.textContent?.includes(expectedPhone) ?? false;
    },
    local,
    { timeout },
  );
}

/** Admin lazy route finished loading — body matches keyword and no error boundary. */
export async function waitForAdminPageReady(page: Page, keyword: string | RegExp, timeout = 25_000): Promise<void> {
  const pattern = typeof keyword === 'string' ? new RegExp(keyword, 'i') : keyword;
  await expect
    .poll(
      async () => {
        const body = (await page.textContent('body')) ?? '';
        if (/something went wrong|page update available/i.test(body)) return '';
        return pattern.test(body) ? 'ready' : '';
      },
      { timeout },
    )
    .toBe('ready');
}

/** Checkout form is interactive (order type + pay section visible). */
export async function waitForCheckoutReady(page: Page, timeout = 20_000): Promise<void> {
  await expect(
    page.locator('button[aria-pressed]').filter({ hasText: /takeaway|pickup|delivery/i }).first(),
  ).toBeVisible({ timeout });
}

/**
 * Establish a customer UI session.
 * Prefer session cookies from a prior `page.request` password login.
 * Legacy Bearer `token` is still injected into localStorage when provided
 * (older staging builds); current builds rely on the cookie jar.
 */
export async function injectCustomerTokenAndWait(
  page: Page,
  token: string,
  phone: string,
): Promise<void> {
  const local = phone.replace(/^\+?960/, '');
  await page.goto('/order/', { waitUntil: 'domcontentloaded' });
  if (token) {
    await page.evaluate(
      ({ t, ph }: { t: string; ph: string }) => {
        localStorage.setItem('online_token', t);
        localStorage.setItem('online_customer_name', ph);
        window.dispatchEvent(new Event('auth_change'));
      },
      { t: token, ph: local },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await waitForCustomerSession(page, local);
}
