/**
 * Content & Branding — compact + desktop bands (real Chromium layout).
 * LOCAL project only.
 *
 * Matrix row 15. Rewritten 2026-08-16: there is no docked preview column at any
 * width any more, on either hub. Both moved to the page-tab workspace, which
 * dropped the preview pane in favour of a "View live site" link and the
 * Desktop|Mobile filter. What this row now guards is that the tab row and the
 * open section stay inside every band without scrolling sideways — a row of
 * five tabs is the thing most likely to overflow a narrow laptop.
 */
import { test, expect, type Page } from '@playwright/test';

import { gotoAdminAuthenticated } from '../../helpers/injectAuth';
import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';
import { expectNoDocumentHorizontalOverflow } from '../../helpers/mobileLayout';

const COMPACT_WIDTHS = [768, 1024, 1199] as const;
const DESKTOP_WIDTHS = [1200, 1366] as const;
const ALL_WIDTHS = [...COMPACT_WIDTHS, ...DESKTOP_WIDTHS];

type Hub = { path: string; root: string; tabsLabel: RegExp; tabCount: number };

const HUBS: Hub[] = [
  {
    path: '/admin/content/website',
    root: 'website-content-workspace',
    tabsLabel: /website pages/i,
    tabCount: 5,
  },
  {
    path: '/admin/content/order-app',
    root: 'order-app-content-workspace',
    tabsLabel: /order app screens/i,
    tabCount: 3,
  },
];

/** A laptop has no landing screen — it opens straight on Home. */
async function openHub(page: Page, hub: Hub): Promise<void> {
  await gotoAdminAuthenticated(page, hub.path);
  await expect(page.getByTestId(hub.root)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(hub.root)).toHaveAttribute('data-tab', 'Home', { timeout: 15_000 });
  await expect(page.getByTestId('wcw-sections')).toBeVisible({ timeout: 15_000 });
}

test.describe('Content & Branding desktop bands', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of ALL_WIDTHS) {
    test.describe(`${width}px`, () => {
      test.use({
        viewport: { width, height: 900 },
        isMobile: false,
        hasTouch: false,
      });

      for (const hub of HUBS) {
        const app = hub.root.replace('-content-workspace', '');

        test(`${app}: tabs fit without sideways scroll @ ${width}`, async ({ page }) => {
          // A stale "preview open" preference must not resurrect the column.
          await page.addInitScript(() => {
            window.localStorage.setItem('bg_hub_preview_open', '1');
          });

          await openHub(page, hub);

          const tabs = page.getByRole('tablist', { name: hub.tabsLabel });
          await expect(tabs).toBeVisible();
          await expect(tabs.getByRole('tab')).toHaveCount(hub.tabCount);

          // The tab row itself must not scroll internally.
          const { scrollWidth, clientWidth } = await tabs.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }));
          expect(
            scrollWidth,
            `tab row scrolls sideways at ${width}px (${scrollWidth} > ${clientWidth})`,
          ).toBeLessThanOrEqual(clientWidth + 1);

          await expectNoDocumentHorizontalOverflow(page);
        });

        test(`${app}: no docked preview at any width @ ${width}`, async ({ page }) => {
          await page.addInitScript(() => {
            window.localStorage.setItem('bg_hub_preview_open', '1');
          });

          await openHub(page, hub);

          await expect(page.locator('.hub-preview-pane--column')).toHaveCount(0);
          await expect(page.getByTestId('preview-toggle')).toHaveCount(0);
          await expect(page.getByTestId('hub-desktop-shell')).toHaveCount(0);
          await expect(page.getByTestId('view-live-site')).toBeVisible();
          await expectNoDocumentHorizontalOverflow(page);
        });

        test(`${app}: an open section fits the band @ ${width}`, async ({ page }) => {
          await openHub(page, hub);

          // Each hub opens one section already expanded (the website's hero,
          // the Order App's greeting). Only click when it is still closed —
          // clicking an open section closes it.
          const section = page.getByTestId('wcw-section-hero');
          await expect(section).toBeVisible({ timeout: 15_000 });
          if ((await section.getAttribute('data-open')) !== 'yes') {
            await page.getByTestId('wcw-section-toggle-hero').click();
          }
          const body = page.getByTestId('wcw-section-body-hero');
          await expect(body).toBeVisible({ timeout: 15_000 });

          // A laptop gets the wide hero editor; it must still fit the band.
          await expect(page.getByTestId('hero-slides-wide')).toBeVisible({ timeout: 15_000 });
          const box = await body.boundingBox();
          expect(box, 'section body must have a box').toBeTruthy();
          expect(
            box!.x + box!.width,
            `open section overflows the ${width}px band`,
          ).toBeLessThanOrEqual(width + 1);

          await expectNoDocumentHorizontalOverflow(page);
        });
      }
    });
  }
});
