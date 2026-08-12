/**
 * Content Hub mobile layout — real Chromium layout engine.
 * LOCAL project only. Does not inject CSS; asserts against shipped admin styles.
 *
 * FINDING (do not "fix" in this file): at 320px, documentElement.scrollWidth is
 * ~324–325 (> viewport). Specs at 320 are expected to fail until that layout bug
 * is fixed in application CSS. 375 / 390 must stay green on real styles.
 *
 * Breakage proof (must FAIL against real CSS):
 * 1) Unreachable `@media` around `.page-header` → editor sheet @ 375
 *    (`.page-header-actions` right edge ~473).
 * 2) `.content-editor-sheet { position: static; width: 3000px }` → scrollWidth 3000
 *    on overview + sheet specs @ 375.
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
  await expect(page.getByTestId('section-rail-grid')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('section-card-Hero')).toBeVisible({ timeout: 15_000 });
}

async function openHeroSheet(page: Page): Promise<void> {
  const heroCard = page.getByTestId('section-card-Hero');
  if (await heroCard.isVisible().catch(() => false)) {
    await heroCard.click();
  } else {
    // Already deep-linked into a group, or grid rendered differently — open via URL.
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
      });

      test(`image library + crop flow stay inside viewport @ ${width}`, async ({ page }) => {
        await openContentHub(page);
        await openHeroSheet(page);
        await page.getByTestId('edit-hero_slides').click();
        await expect(page.getByTestId('hero-editor-sheet')).toBeVisible();
        await page.getByTestId('hero-slide-overview-0').click();
        const slideSheet = page.getByTestId('hero-slide-editor-sheet');
        await expect(slideSheet).toBeVisible();

        // Library picker (image library)
        await slideSheet.getByRole('button', { name: /^Library$/i }).click();
        const picker = page.getByTestId('media-picker-modal');
        await expect(picker).toBeVisible({ timeout: 15_000 });
        await expectContentHubChromeInViewport(page);
        await picker.getByRole('button', { name: /^Close$/i }).click();
        await expect(picker).toBeHidden({ timeout: 10_000 });

        // Crop modal via the slide sheet's image file input
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
