/**
 * Content Hub mobile layout — real Chromium layout engine.
 * LOCAL project only. Does not inject CSS; asserts against shipped admin styles.
 *
 * Overview uses the Customer Surface Map task landing (not the old section-grid).
 * Overflow must stay green at 320 / 375 / 390 — do not accept known overflow.
 */
import path from 'path';
import { test, expect, type Page } from '@playwright/test';

import { gotoAdminAuthenticated } from '../../helpers/injectAuth';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';
import {
  expectContentHubChromeInViewport,
  expectNoDocumentHorizontalOverflow,
  expectTextWrapsNotScrollsX,
} from '../../helpers/mobileLayout';

const WIDTHS = [320, 375, 390] as const;
const FIXTURE_PNG = path.resolve(__dirname, '../../fixtures/mobile-layout-hero.png');

async function openContentHub(page: Page): Promise<void> {
  await gotoAdminAuthenticated(page, '/admin/content');
  await expect(page.getByTestId('content-task-landing')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('task-cluster-global')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('task-card-hero')).toBeVisible();
  await expect(page.getByTestId('task-card-order_menu')).toBeVisible();
  await expect(page.getByTestId('task-card-status_banners')).toBeVisible();
}

async function openHeroSheet(page: Page): Promise<void> {
  const heroCard = page.getByTestId('task-card-hero');
  if (await heroCard.isVisible().catch(() => false)) {
    await heroCard.click();
  } else {
    await page.goto('/admin/content?group=Hero', { waitUntil: 'domcontentloaded' });
  }
  await expect(page.getByTestId('content-editor-sheet')).toBeVisible({ timeout: 15_000 });
}

test.describe('Content Hub mobile layout (real engine)', () => {
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

      test(`overview + header chrome fit viewport @ ${width}`, async ({ page }) => {
        await openContentHub(page);
        await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
        await expect(page.getByTestId('draft-save-status')).toBeVisible();
        await expectNoDocumentHorizontalOverflow(page);

        const searchToggle = page.getByTestId('hub-search-toggle');
        if (await searchToggle.isVisible().catch(() => false)) {
          await searchToggle.click();
          await expect(page.getByTestId('hub-search-overlay')).toBeVisible();
        }

        await expectContentHubChromeInViewport(page);
      });

      test(`editor sheet + hero slide sheet fit viewport @ ${width}`, async ({ page }) => {
        await openContentHub(page);
        await openHeroSheet(page);

        const sheet = page.getByTestId('content-editor-sheet');
        await expect(sheet).toHaveAttribute('role', 'dialog');
        await expectNoDocumentHorizontalOverflow(page);
        await expectContentHubChromeInViewport(page);

        await page.getByTestId('edit-hero_slides').click();
        const heroSheet = page.getByTestId('hero-editor-sheet');
        await expect(heroSheet).toBeVisible();
        await expectContentHubChromeInViewport(page);

        await page.getByTestId('hero-slide-overview-0').click();
        const slideSheet = page.getByTestId('hero-slide-editor-sheet');
        await expect(slideSheet).toBeVisible();

        const title = slideSheet.getByLabel(/Title \(HTML/i);
        await expect(title).toBeVisible();
        await title.fill(
          'Extremely long hero title that must wrap on a phone instead of forcing horizontal overflow across the editor sheet',
        );
        const subtitle = slideSheet.getByLabel(/Subtitle/i);
        if (await subtitle.count()) {
          await subtitle.fill(
            'A long subtitle with raw technical values /api/admin/content?locale=en&scope=website and CTA copy that should wrap vertically',
          );
        }
        await expectTextWrapsNotScrollsX(page, title);
        await expectNoDocumentHorizontalOverflow(page);
        await expectContentHubChromeInViewport(page);
      });

      test(`⋯ action sheet stays inside viewport @ ${width}`, async ({ page }) => {
        await openContentHub(page);
        await openHeroSheet(page);

        await page.getByTestId('block-more-hero_slides').click();
        const menu = page.getByTestId('block-menu-hero_slides');
        await expect(menu).toBeVisible();
        await expect(menu).toContainText('hero_slides');
        await expectContentHubChromeInViewport(page);
        await expectNoDocumentHorizontalOverflow(page);
      });

      test(`image library + crop flow stay inside viewport @ ${width}`, async ({ page }) => {
        await openContentHub(page);
        await openHeroSheet(page);
        await page.getByTestId('edit-hero_slides').click();
        await expect(page.getByTestId('hero-editor-sheet')).toBeVisible();
        await page.getByTestId('hero-slide-overview-0').click();
        const slideSheet = page.getByTestId('hero-slide-editor-sheet');
        await expect(slideSheet).toBeVisible();

        await slideSheet.getByRole('button', { name: /^Library$/i }).click();
        const picker = page.getByTestId('media-picker-modal');
        await expect(picker).toBeVisible({ timeout: 15_000 });
        await expectContentHubChromeInViewport(page);
        await picker.getByRole('button', { name: /^Close$/i }).click();
        await expect(picker).toBeHidden({ timeout: 10_000 });

        const fileInput = slideSheet.locator('input[type="file"][accept*="image"]').first();
        await expect(fileInput).toBeAttached({ timeout: 10_000 });
        await fileInput.setInputFiles(FIXTURE_PNG);

        const cropDialog = page.locator('[role="dialog"][aria-label="Crop content image"]');
        await expect(cropDialog).toBeVisible({ timeout: 15_000 });
        await expectContentHubChromeInViewport(page);
        await expectNoDocumentHorizontalOverflow(page);
      });
    });
  }
});
