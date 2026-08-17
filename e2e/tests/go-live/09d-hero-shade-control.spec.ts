/**
 * "Shade behind all the text" — the hero control, in the real admin. LOCAL only.
 *
 * Owner, 2026-08-17: "I don't see any changes in the background settings. I
 * checked website settings hero." The 2026-08-16 fix turned the whole-block
 * shade off automatically whenever a heading or subheading had its own
 * background — correct behaviour, but invisible and un-steerable: the "Text
 * background" slider silently stopped doing anything, with nothing on screen
 * saying so. The owner asked for a control instead.
 *
 * What must hold, and can only be checked by driving the real screen:
 *   1. the control is actually on the hero editor;
 *   2. choosing a heading background explains why the slider went quiet;
 *   3. "Always" gives the owner the shade back over a panel.
 */
import { test, expect, type Page } from '@playwright/test';

import { gotoAdminAuthenticated } from '../../helpers/injectAuth';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

async function openHeroEditor(page: Page): Promise<void> {
  await gotoAdminAuthenticated(page, '/admin/content/website');
  await expect(page.getByTestId('website-content-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('wcw-sections')).toBeVisible({ timeout: 15_000 });

  const section = page.getByTestId('wcw-section-hero');
  await expect(section).toBeVisible({ timeout: 15_000 });
  if ((await section.getAttribute('data-open')) !== 'yes') {
    await page.getByTestId('wcw-section-toggle-hero').click();
  }
  await expect(page.getByTestId('wcw-section-body-hero')).toBeVisible({ timeout: 15_000 });
}

/** Give slide 0's heading its own glass panel. */
async function giveHeadingAPanel(page: Page): Promise<void> {
  const toggle = page.locator('button', { hasText: 'Title background' }).first();
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  const glass = page.getByTestId('hero-bg-swatch-0-title-glass');
  await expect(glass).toBeVisible({ timeout: 10_000 });
  await glass.click();
}

const sliderOpacity = (page: Page) =>
  page.locator('#hero-0-text-background').evaluate((el) => Number(getComputedStyle(el).opacity));

test.describe('Hero shade control', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  test.use({ viewport: { width: 1440, height: 1200 } });

  test('the control is on the hero editor, defaulting to Auto', async ({ page }) => {
    await openHeroEditor(page);

    await expect(page.getByTestId('hero-copy-scrim-0-auto')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('hero-copy-scrim-0-always')).toBeVisible();
    await expect(page.getByTestId('hero-copy-scrim-0-off')).toBeVisible();

    // Auto is the behaviour the owner already approved, so it must be the default.
    await expect(page.getByTestId('hero-copy-scrim-0-auto')).toHaveAttribute('aria-checked', 'true');
  });

  test('a heading background explains why the slider went quiet', async ({ page }) => {
    await openHeroEditor(page);

    // Before: the slider is live and says what it does.
    expect(await sliderOpacity(page)).toBeGreaterThan(0.9);
    await expect(page.getByTestId('hero-text-background-note-0')).toContainText('Dark panel behind the words');

    await giveHeadingAPanel(page);

    // After: it is visibly stood down, and the note says why rather than
    // leaving the owner to wonder whether the setting is broken.
    expect(await sliderOpacity(page)).toBeLessThan(0.6);
    await expect(page.getByTestId('hero-text-background-note-0')).toContainText('box inside a box');
  });

  test('Always gives the shade back over a panel', async ({ page }) => {
    await openHeroEditor(page);
    await giveHeadingAPanel(page);
    expect(await sliderOpacity(page)).toBeLessThan(0.6);

    await page.getByTestId('hero-copy-scrim-0-always').click();

    // The owner's override must beat the automatic rule, not merely lose to it.
    await expect(page.getByTestId('hero-copy-scrim-0-always')).toHaveAttribute('aria-checked', 'true');
    expect(await sliderOpacity(page)).toBeGreaterThan(0.9);
    await expect(page.getByTestId('hero-text-background-note-0')).toContainText('Dark panel behind the words');

    // And Off stands it down again, panel or no panel.
    await page.getByTestId('hero-copy-scrim-0-off').click();
    expect(await sliderOpacity(page)).toBeLessThan(0.6);
    await expect(page.getByTestId('hero-text-background-note-0')).toContainText('set to Off');
  });
});
