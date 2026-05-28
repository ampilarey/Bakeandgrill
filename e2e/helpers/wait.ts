/**
 * Reliable wait helpers — prefer these over fixed waitForTimeout / networkidle.
 */
import { expect, type Page } from '@playwright/test';

/** Customer token is set and header shows the expected local phone digits. */
export async function waitForCustomerSession(page: Page, phone: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction(
    (expectedPhone) => {
      if (!localStorage.getItem('online_token')) return false;
      const header = document.querySelector('header');
      return header?.textContent?.includes(expectedPhone) ?? false;
    },
    phone,
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

/** Inject token, reload, and wait until the customer session is live in the UI. */
export async function injectCustomerTokenAndWait(
  page: Page,
  token: string,
  phone: string,
): Promise<void> {
  await page.goto('/order/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ t, ph }: { t: string; ph: string }) => {
      localStorage.setItem('online_token', t);
      localStorage.setItem('online_customer_name', ph);
      window.dispatchEvent(new Event('auth_change'));
    },
    { t: token, ph: phone },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCustomerSession(page, phone);
}
