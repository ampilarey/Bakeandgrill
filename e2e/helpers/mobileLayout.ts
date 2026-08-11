/**
 * Real-layout assertions for Playwright (Chromium). Do not inject styles.
 */
import { expect, type Locator, type Page } from '@playwright/test';

const EDGE_TOLERANCE_PX = 1;

/** documentElement.scrollWidth must not exceed the viewport width. */
export async function expectNoDocumentHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
  }));
  const viewport = Math.min(clientWidth, innerWidth);
  expect(
    scrollWidth,
    `documentElement.scrollWidth (${scrollWidth}) exceeds viewport (${viewport})`,
  ).toBeLessThanOrEqual(viewport + EDGE_TOLERANCE_PX);
}

type Box = { x: number; y: number; width: number; height: number };

function rightEdge(box: Box): number {
  return box.x + box.width;
}

/**
 * Interactive / content nodes must not paint outside the viewport horizontally.
 * Vertically long content may scroll; horizontal overflow is the failure mode.
 */
export async function expectLocatorsFitViewport(
  page: Page,
  locators: Locator[],
  label: string,
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport, 'viewport must be set').toBeTruthy();
  const vw = viewport!.width;

  for (let i = 0; i < locators.length; i += 1) {
    const loc = locators[i];
    const count = await loc.count();
    for (let j = 0; j < count; j += 1) {
      const el = loc.nth(j);
      if (!(await el.isVisible().catch(() => false))) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      expect(
        box.x,
        `${label}[${i}.${j}] left edge ${box.x} is outside viewport`,
      ).toBeGreaterThanOrEqual(-EDGE_TOLERANCE_PX);
      expect(
        rightEdge(box),
        `${label}[${i}.${j}] right edge ${rightEdge(box)} exceeds viewport ${vw}`,
      ).toBeLessThanOrEqual(vw + EDGE_TOLERANCE_PX);
    }
  }
}

/**
 * Content Hub surfaces that must stay inside the viewport.
 * Scoped to hub/sheet chrome (not the global admin tab bar — see FINDING in the
 * mobile-layout PR notes: `.admin-shell-mobile-tab` "Team" overflows ~14px at 375).
 */
export async function expectContentHubChromeInViewport(page: Page): Promise<void> {
  await expectNoDocumentHorizontalOverflow(page);

  const hubRoot = page.locator(
    '.hub-page, .content-studio-page, [data-testid="content-editor-sheet"], [data-testid="hero-editor-sheet"], [data-testid="hero-slide-editor-sheet"], [data-testid="media-picker-modal"], .hub-mobile-action-sheet, .content-mobile-action-sheet, [data-testid="block-menu-hero_slides"]',
  );

  await expectLocatorsFitViewport(
    page,
    [
      page.locator('.hub-page .page-header, .content-studio-page .page-header'),
      page.locator('.hub-page .page-header-actions, .content-studio-page .page-header-actions'),
      page.locator('[data-testid="draft-save-status"]'),
      page.locator('[role="group"][aria-label="Language"]'),
      page.locator('[data-testid="hub-search-toggle"]'),
      page.locator('[data-testid="hub-search-overlay"]'),
      page.locator('[data-testid="content-editor-sheet"]'),
      page.locator('[data-testid="hero-editor-sheet"]'),
      page.locator('[data-testid="hero-slide-editor-sheet"]'),
      page.locator('[data-testid="media-picker-modal"]'),
      page.locator('[data-testid="media-picker-footer"]'),
      page.locator('[role="dialog"]').filter({ hasText: /Crop|framed area/i }),
      page.locator('[data-testid="block-menu-hero_slides"]'),
      page.locator('.hub-mobile-action-sheet, .content-mobile-action-sheet'),
      hubRoot.locator('button, a, img, input, textarea, select, footer'),
    ],
    'content-hub-chrome',
  );
}

/** Long text fields must wrap (no element-level horizontal scroll wider than viewport). */
export async function expectTextWrapsNotScrollsX(page: Page, locator: Locator): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const info = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: style.overflowX,
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak,
    };
  });
  const box = await locator.boundingBox();
  if (box) {
    expect(box.width).toBeLessThanOrEqual(viewport!.width + EDGE_TOLERANCE_PX);
  }
  // Prefer wrapping; if the node scrolls internally it must still fit the viewport box.
  if (info.scrollWidth > info.clientWidth + EDGE_TOLERANCE_PX) {
    expect(
      info.overflowX === 'auto' || info.overflowX === 'scroll',
      `text overflows horizontally without an intentional scroll container (overflow-x=${info.overflowX})`,
    ).toBeTruthy();
  }
}
