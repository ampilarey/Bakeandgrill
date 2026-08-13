/**
 * Content Hub Stage 5 — compact + desktop bands (real Chromium layout).
 * LOCAL project only.
 *
 * Matrix row 15: no permanently docked preview at 768 / 1024 / 1199.
 * Desktop: optional docked preview at 1200 / 1366 (§7.2).
 */
import { test, expect, type Page } from '@playwright/test';

import { gotoAdminAuthenticated } from '../../helpers/injectAuth';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';
import { expectNoDocumentHorizontalOverflow } from '../../helpers/mobileLayout';

const COMPACT_WIDTHS = [768, 1024, 1199] as const;
const DESKTOP_WIDTHS = [1200, 1366] as const;

async function openWebsiteHub(page: Page): Promise<void> {
  await gotoAdminAuthenticated(page, '/admin/content/website');
  await expect(page.getByTestId('surface-builder-landing')).toBeVisible({ timeout: 30_000 });
}

async function openHomeEditorDesktop(page: Page): Promise<void> {
  await page.goto('/admin/content/website?group=Home', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('hub-desktop-shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('section-editor')).toBeVisible({ timeout: 15_000 });
}

test.describe('Content Hub compact Admin (no docked preview)', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of COMPACT_WIDTHS) {
    test.describe(`${width}px`, () => {
      test.use({
        viewport: { width, height: 900 },
        isMobile: false,
        hasTouch: false,
      });

      test(`shell collapses rail and never docks preview column @ ${width}`, async ({ page }) => {
        await openWebsiteHub(page);
        await openHomeEditorDesktop(page);

        const shell = page.getByTestId('hub-desktop-shell');
        await expect(shell).toHaveAttribute('data-rail', 'collapsed');
        await expect(page.locator('.hub-preview-pane--column')).toHaveCount(0);
        await expectNoDocumentHorizontalOverflow(page);

        // Preview toggle must open a sheet, not a permanent column.
        await page.getByTestId('preview-toggle').click();
        await expect(page.getByTestId('preview-sheet')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('.hub-preview-pane--column')).toHaveCount(0);
        await expectNoDocumentHorizontalOverflow(page);

        await page.getByTestId('preview-sheet-close').click();
        await expect(page.getByTestId('preview-sheet')).toBeHidden();
      });
    });
  }
});

test.describe('Content Hub wide desktop (optional docked preview)', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of DESKTOP_WIDTHS) {
    test.describe(`${width}px`, () => {
      test.use({
        viewport: { width, height: 900 },
        isMobile: false,
        hasTouch: false,
      });

      test(`optional preview column can dock @ ${width}`, async ({ page }) => {
        // Clear persisted preview preference so the toggle starts from a known state.
        await page.addInitScript(() => {
          window.localStorage.setItem('bg_hub_preview_open', '0');
        });

        await openWebsiteHub(page);
        await openHomeEditorDesktop(page);

        await expect(page.getByTestId('hub-desktop-shell')).toBeVisible();
        await expect(page.locator('.hub-preview-pane--column')).toHaveCount(0);
        await expectNoDocumentHorizontalOverflow(page);

        await page.getByTestId('preview-toggle').click();
        await expect(page.locator('.hub-preview-pane--column')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('preview-sheet')).toHaveCount(0);
        await expectNoDocumentHorizontalOverflow(page);

        await page.getByTestId('preview-toggle').click();
        await expect(page.locator('.hub-preview-pane--column')).toHaveCount(0);
      });
    });
  }
});
