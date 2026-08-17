/**
 * The hero styling controls, on a phone. LOCAL only.
 *
 * The admin has two hero editors — a wide one for laptops and a separate
 * phone one that edits a single slide at a time. Everything added on
 * 2026-08-17 (shape, colours, outlines, borders, geometry, type, alignment,
 * motion) went in through shared render helpers, but nothing was stopping a
 * later change from wiring a control into the wide layout only and leaving the
 * phone behind. The owner works from a phone — every fault reported in this
 * area was a phone fault — so "reachable on a phone" is a requirement, not a
 * nicety.
 *
 * This also guards the width: the styling panel is long and full of sliders and
 * swatch rows, which is exactly the shape of thing that quietly pushes a 320px
 * screen into sideways scrolling.
 */
import { test, expect, type Page } from '@playwright/test';

import { gotoAdminAuthenticated } from '../../helpers/injectAuth';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

/** Controls that live on the slide itself. */
const SLIDE_CONTROLS = [
  'hero-text-anim-0-line',
  'hero-box-anim-0-glow',
  'hero-photo-anim-0-zoom',
  'hero-motion-speed-0',
  'hero-text-align-0-left',
  'hero-copy-scrim-0-auto',
] as const;

/** Controls behind the "Title background" panel. */
const ELEMENT_CONTROLS = [
  'hero-bg-shape-0-title-line',
  'hero-text-color-0-title-picker',
  'hero-em-color-0-title-picker',
  'hero-outline-0-title',
  'hero-border-0-title',
  'hero-radius-0-title',
  'hero-font-scale-0-title',
] as const;

async function openHeroSlideOnAPhone(page: Page): Promise<void> {
  await gotoAdminAuthenticated(page, '/admin/content/website');
  await expect(page.getByTestId('website-content-workspace')).toBeVisible({ timeout: 30_000 });

  // The phone workspace opens on a page list; sections come after.
  await expect(page.getByTestId('wcw-pagelist')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('wcw-page-Home').click();
  await expect(page.getByTestId('wcw-sections')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('wcw-section-toggle-hero').click();
  await expect(page.getByTestId('wcw-section-body-hero')).toBeVisible({ timeout: 15_000 });

  // The phone editor is a list of slides; the controls are one tap in.
  await expect(page.getByTestId('hero-slides-mobile')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('hero-slide-overview-0').click();
}

test.describe('Hero controls on a phone', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of [320, 390] as const) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test(`every hero control is reachable @ ${width}`, async ({ page }) => {
        await openHeroSlideOnAPhone(page);

        for (const id of SLIDE_CONTROLS) {
          await expect(
            page.getByTestId(id),
            `${id} is missing from the phone editor`,
          ).toHaveCount(1);
        }

        // Colour and outline controls only appear once the element has a
        // background — there is nothing to style otherwise.
        const titleToggle = page.locator('button', { hasText: 'Title background' }).first();
        await expect(titleToggle, 'the Title background panel is missing on a phone').toHaveCount(1);
        await titleToggle.scrollIntoViewIfNeeded();
        await titleToggle.click();

        const dark = page.getByTestId('hero-bg-swatch-0-title-dark');
        await expect(dark).toBeVisible({ timeout: 10_000 });
        await dark.click();

        for (const id of ELEMENT_CONTROLS) {
          await expect(
            page.getByTestId(id),
            `${id} is missing from the phone editor`,
          ).toHaveCount(1);
        }
      });

      test(`the styling panel does not push the page sideways @ ${width}`, async ({ page }) => {
        await openHeroSlideOnAPhone(page);

        const titleToggle = page.locator('button', { hasText: 'Title background' }).first();
        await titleToggle.scrollIntoViewIfNeeded();
        await titleToggle.click();
        const dark = page.getByTestId('hero-bg-swatch-0-title-dark');
        await expect(dark).toBeVisible({ timeout: 10_000 });
        await dark.click();
        // Outline and border reveal a further colour field and slider each.
        await page.getByTestId('hero-outline-0-title').click();
        await page.getByTestId('hero-border-0-title').click();

        const r = await page.evaluate((w) => {
          const spill: string[] = [];
          document.querySelectorAll('[data-testid^="hero-"]').forEach((el) => {
            const b = (el as HTMLElement).getBoundingClientRect();
            if (b.width > 0 && b.right > w + 1) {
              spill.push(`${el.getAttribute('data-testid')}@${Math.round(b.right)}`);
            }
          });
          return { docScroll: document.documentElement.scrollWidth, spill };
        }, width);

        expect(r.spill, `controls spill past ${width}px: ${r.spill.join(', ')}`).toEqual([]);
        expect(r.docScroll, `the page scrolls sideways at ${width}px`).toBeLessThanOrEqual(width + 1);
      });
    });
  }
});
