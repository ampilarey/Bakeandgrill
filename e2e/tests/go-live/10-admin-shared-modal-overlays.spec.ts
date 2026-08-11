/**
 * SharedUI Modal overlays — real Chromium layout at phone widths.
 * Covers the six pages converted from hand-rolled fixed overlays (§6.2).
 * Does NOT inject CSS.
 */
import { test, expect, type Page } from '@playwright/test';

import { gotoAdminAuthenticated } from '../../helpers/injectAuth';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';
import { expectSharedModalLayoutOk } from '../../helpers/sharedModalLayout';

const WIDTHS = [320, 375, 390] as const;

async function openWebhooksLogs(page: Page): Promise<void> {
  await gotoAdminAuthenticated(page, '/admin/webhooks');
  const logsBtn = page.getByRole('button', { name: /^Logs$/i }).first();
  await expect(logsBtn).toBeVisible({ timeout: 20_000 });
  await logsBtn.click();
}

test.describe('SharedUI Modal overlays (real engine)', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of WIDTHS) {
    test.describe(`${width}px`, () => {
      test.use({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
      });

      test(`Orders detail modal fits + locks scroll @ ${width}`, async ({ page }) => {
        // Deep-link opens the SharedUI Modal (View button is desktop-table chrome).
        await gotoAdminAuthenticated(page, '/admin/orders?order=202');
        await expectSharedModalLayoutOk(page);
      });

      test(`Customers detail modal fits + locks scroll @ ${width}`, async ({ page }) => {
        await gotoAdminAuthenticated(page, '/admin/customers');
        const row = page.locator('table tbody tr[role="button"]').first();
        await expect(row).toBeVisible({ timeout: 20_000 });
        await row.click();
        await expectSharedModalLayoutOk(page);
      });

      test(`Webhooks logs modal fits + locks scroll @ ${width}`, async ({ page }) => {
        await openWebhooksLogs(page);
        await expectSharedModalLayoutOk(page);
      });

      test(`Delivery detail modal fits + locks scroll @ ${width}`, async ({ page }) => {
        await gotoAdminAuthenticated(page, '/admin/delivery');
        const details = page.getByRole('button', { name: /^Details$/i }).first();
        await expect(details).toBeVisible({ timeout: 20_000 });
        await details.click();
        await expectSharedModalLayoutOk(page);
      });

      test(`Menu recipe modal fits + locks scroll @ ${width}`, async ({ page }) => {
        await gotoAdminAuthenticated(page, '/admin/menu');
        await page.getByRole('button', { name: /^Items/i }).click();
        const recipe = page.locator('button[title="View recipe"]').first();
        await expect(recipe).toBeVisible({ timeout: 20_000 });
        await recipe.click();
        await expectSharedModalLayoutOk(page);
      });

      test(`Menu barcode modal fits + locks scroll @ ${width}`, async ({ page }) => {
        await gotoAdminAuthenticated(page, '/admin/menu');
        await page.getByRole('button', { name: /^Items/i }).click();
        const barcode = page.locator('button[title="Print barcode label"]').first();
        await expect(barcode).toBeVisible({ timeout: 20_000 });
        await barcode.click();
        await expectSharedModalLayoutOk(page);
      });
    });
  }
});
