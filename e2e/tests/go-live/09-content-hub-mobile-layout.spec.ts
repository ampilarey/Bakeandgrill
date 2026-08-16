/**
 * Content & Branding on a phone — real Chromium layout engine.
 * LOCAL project only. Does not inject CSS; asserts against shipped admin styles.
 *
 * Matrix row 14 (Stage 5): no horizontal overflow at 320, 375, 390, 414, 767.
 *
 * Rewritten 2026-08-16. Both hubs are the page-tab workspace now: a phone opens
 * on a list of screens, a screen opens in the page, and a section opens in
 * place. The landing, the task cards, the section rail, the editor sheets and
 * the preview sheet this file used to drive were all deleted with the screen
 * they belonged to — see ContentWorkspace and contentWorkspaceConfig.
 *
 * Both apps are covered, because they are one component with two configs and a
 * phone-only fault in either would look identical here.
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

/** Plan §7.2 mobile band — every width must stay green. */
const WIDTHS = [320, 375, 390, 414, 767] as const;
const FIXTURE_PNG = path.resolve(__dirname, '../../fixtures/mobile-layout-hero.png');

type Hub = {
  /** Admin route for this hub. */
  path: string;
  /** Root test id, derived from the workspace config's idPrefix. */
  root: string;
  /** A page every install of this hub has. */
  page: string;
};

const HUBS: Hub[] = [
  { path: '/admin/content/website', root: 'website-content-workspace', page: 'Home' },
  { path: '/admin/content/order-app', root: 'order-app-content-workspace', page: 'Home' },
];

/** A phone opens on the list of screens, not on any one screen. */
async function openHubPageList(page: Page, hub: Hub): Promise<void> {
  await gotoAdminAuthenticated(page, hub.path);
  await expect(page.getByTestId(hub.root)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('wcw-pagelist')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`wcw-page-${hub.page}`)).toBeVisible();
}

/** Open Home and expand its hero section, where the widest editor lives. */
async function openHeroSection(page: Page, hub: Hub): Promise<void> {
  await openHubPageList(page, hub);
  await page.getByTestId(`wcw-page-${hub.page}`).click();
  await expect(page.getByTestId('wcw-sections')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('wcw-section-toggle-hero').click();
  await expect(page.getByTestId('wcw-section-body-hero')).toBeVisible({ timeout: 15_000 });
}

test.describe('Content & Branding phone layout (real engine)', () => {
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

      for (const hub of HUBS) {
        const app = hub.root.replace('-content-workspace', '');

        test(`${app}: page list + header chrome fit viewport @ ${width}`, async ({ page }) => {
          await openHubPageList(page, hub);
          await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
          await expect(page.getByTestId('draft-save-status').first()).toBeVisible();
          await expectNoDocumentHorizontalOverflow(page);

          // Every row of the list must fit — the counts sit at the right edge.
          await expectContentHubChromeInViewport(page);

          const searchToggle = page.getByTestId('hub-search-toggle');
          if (await searchToggle.isVisible().catch(() => false)) {
            await searchToggle.click();
            await expect(page.getByTestId('hub-search-overlay')).toBeVisible();
            await expectContentHubChromeInViewport(page);
          }
        });

        test(`${app}: a screen opens in the page, with a way back @ ${width}`, async ({ page }) => {
          await openHubPageList(page, hub);
          await page.getByTestId(`wcw-page-${hub.page}`).click();

          // In the page — not a dialog. The sheet this used to open is gone.
          await expect(page.getByTestId('wcw-mobile-back')).toBeVisible({ timeout: 15_000 });
          await expect(page.getByTestId('content-editor-sheet')).toHaveCount(0);
          await expectContentHubChromeInViewport(page);

          await page.getByTestId('wcw-mobile-back').click();
          await expect(page.getByTestId('wcw-pagelist')).toBeVisible();
          await expectNoDocumentHorizontalOverflow(page);
        });

        test(`${app}: sections open in place and stay inside the viewport @ ${width}`, async ({ page }) => {
          await openHeroSection(page, hub);

          // The phone gets the stacked hero editor, never the wide 3-column one.
          await expect(page.getByTestId('hero-slides-mobile')).toBeVisible({ timeout: 15_000 });
          await expect(page.getByTestId('hero-slides-wide')).toHaveCount(0);
          await expectContentHubChromeInViewport(page);
          await expectNoDocumentHorizontalOverflow(page);
        });

        test(`${app}: More menu stays inside the viewport @ ${width}`, async ({ page }) => {
          await openHubPageList(page, hub);

          await page.getByRole('button', { name: /More actions/i }).click();
          const menu = page.getByTestId('hub-more-menu-mobile');
          await expect(menu).toBeVisible();
          await expectContentHubChromeInViewport(page);
          await expectNoDocumentHorizontalOverflow(page);
        });
      }

      /**
       * The widest thing in the whole screen: a hero slide's own editor, opened
       * from the stacked overview. Long wording must wrap, not push the page
       * sideways — the failure the owner reported as "contents are on 3 columns
       * in hero which shrinks the content and difficult to see".
       */
      test(`hero slide editor wraps long wording @ ${width}`, async ({ page }) => {
        await openHeroSection(page, HUBS[0]);

        await page.getByTestId('hero-slide-overview-0').click();
        const slideSheet = page.getByTestId('hero-slide-editor-sheet');
        await expect(slideSheet).toBeVisible({ timeout: 15_000 });

        const title = slideSheet.getByLabel(/Title \(HTML/i);
        await expect(title).toBeVisible();
        await title.fill(
          'Extremely long hero title that must wrap on a phone instead of forcing horizontal overflow across the editor',
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

      /**
       * Every repeater row must stack rather than squeeze. This is the check
       * that jsdom cannot make: the unit tests only prove the row asks for
       * `content-editor-row`, not that the CSS actually stacks it.
       *
       * About Values is Order App only and was the one repeater that never
       * opted in (fixed 2026-08-16), so it is asserted here by name.
       */
      test(`Order App repeater rows stack, not squeeze @ ${width}`, async ({ page }) => {
        await openHubPageList(page, HUBS[1]);
        await page.getByTestId('wcw-page-Other pages').click();

        const field = page.getByTestId('wcw-field-about_values');
        await expect(field).toBeVisible({ timeout: 15_000 });

        const rows = field.locator('.content-editor-row');
        const count = await rows.count();
        for (let i = 0; i < count; i += 1) {
          const direction = await rows.nth(i).evaluate((el) => getComputedStyle(el).flexDirection);
          expect(direction, `About Values row ${i} must stack at ${width}px`).toBe('column');
        }
        await expectContentHubChromeInViewport(page);
        await expectNoDocumentHorizontalOverflow(page);
      });

      test(`image library + crop flow stay inside viewport @ ${width}`, async ({ page }) => {
        await openHeroSection(page, HUBS[0]);
        await page.getByTestId('hero-slide-overview-0').click();
        const slideSheet = page.getByTestId('hero-slide-editor-sheet');
        await expect(slideSheet).toBeVisible({ timeout: 15_000 });

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
