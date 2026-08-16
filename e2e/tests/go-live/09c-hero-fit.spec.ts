/**
 * Hero heading fit — real Chromium layout engine. LOCAL project only.
 *
 * Owner audit, 2026-08-16: "hero banner heading and sub headings background,
 * now its too large sometimes over lap with others and overlap if there is two
 * lines". Measured at 320px: a four-line heading made the copy panel 394px tall
 * inside a 360px banner, so it began 78px ABOVE the banner, was clipped by
 * .hero-banner{overflow:hidden} — the heading lost its first line — and the
 * open/closed badge sat on top of the words.
 *
 * Three rules now hold, and none of them can be checked without a layout
 * engine, which is why they live here and not in a unit test:
 *   1. the copy block never starts above the banner it lives in;
 *   2. the open/closed badge never touches the heading;
 *   3. a panelled slide draws one background, not a box inside a box.
 */
import { test, expect, type Page } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

/** The bands the owner's phones and laptops actually sit in. */
const WIDTHS = [320, 375, 390, 414, 768, 1280] as const;

type Rects = {
  slideTop: number;
  copyTop: number;
  copyBottom: number;
  slideBottom: number;
  badgeOverlapsHeading: boolean;
  panelled: boolean;
  copyHasBackground: boolean;
  headingFontPx: number;
  headingBand: string | null;
};

async function readHero(page: Page): Promise<Rects | null> {
  return page.evaluate(() => {
    const slide = document.querySelector('.banner-slide') as HTMLElement | null;
    const copy = document.querySelector('.banner-copy') as HTMLElement | null;
    const heading = document.querySelector('.banner-title') as HTMLElement | null;
    const badge = document.querySelector('.hero-status') as HTMLElement | null;
    if (!slide || !copy) return null;

    const s = slide.getBoundingClientRect();
    const c = copy.getBoundingClientRect();
    const h = heading?.getBoundingClientRect();
    const b = badge?.getBoundingClientRect();

    const overlaps =
      h && b
        ? !(h.right < b.left || h.left > b.right || h.bottom < b.top || h.top > b.bottom)
        : false;

    const copyBg = getComputedStyle(copy).backgroundImage;

    return {
      slideTop: s.top,
      slideBottom: s.bottom,
      copyTop: c.top,
      copyBottom: c.bottom,
      badgeOverlapsHeading: overlaps,
      panelled: copy.getAttribute('data-panelled') === '1',
      copyHasBackground: copyBg !== 'none' && copyBg !== '',
      headingFontPx: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0,
      headingBand: heading?.getAttribute('data-len') ?? null,
    };
  });
}

test.describe('Hero heading fit (real engine)', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of WIDTHS) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test(`heading stays inside its banner and clear of the badge @ ${width}`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const r = await readHero(page);
        test.skip(r === null, 'no hero slide configured on this install');

        // 1. The copy must never escape upward out of the banner. This is the
        //    fault itself: at 320 it used to start 78px above the banner top.
        expect(
          Math.round(r!.copyTop),
          `copy starts ${Math.round(r!.slideTop - r!.copyTop)}px above the banner — it will be clipped`,
        ).toBeGreaterThanOrEqual(Math.round(r!.slideTop) - 1);

        // …and must not run out of the bottom either.
        expect(Math.round(r!.copyBottom)).toBeLessThanOrEqual(Math.round(r!.slideBottom) + 1);

        // 2. The open/closed badge is absolutely positioned over the same box.
        expect(r!.badgeOverlapsHeading, 'the open/closed badge is sitting on the heading').toBe(false);
      });

      test(`a panelled slide draws one background, not two @ ${width}`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const r = await readHero(page);
        test.skip(r === null, 'no hero slide configured on this install');
        test.skip(!r!.panelled, 'this slide has no heading/subheading panel');

        // Owner's choice: when the heading carries its own panel the gradient
        // behind the whole block steps back, or you get a box inside a box.
        expect(
          r!.copyHasBackground,
          'heading has its own panel AND the block gradient is still painted — box inside a box',
        ).toBe(false);
      });

      test(`a long heading is drawn smaller than the banner's base size @ ${width}`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const r = await readHero(page);
        test.skip(r === null, 'no hero slide configured on this install');
        test.skip(!r!.headingBand, 'this heading is short enough to need no step-down');

        // Owner chose "words shrink to fit the banner" over "banner grows".
        // The exact size is a design choice; what must hold is that it is
        // actually smaller than the untouched base size for this width.
        const base = await page.evaluate(() => {
          const probe = document.createElement('h2');
          probe.className = 'banner-title';
          probe.style.position = 'absolute';
          probe.style.visibility = 'hidden';
          document.querySelector('.banner-copy')?.appendChild(probe);
          const size = parseFloat(getComputedStyle(probe).fontSize);
          probe.remove();
          return size;
        });
        expect(r!.headingFontPx).toBeLessThan(base);
      });
    });
  }
});
