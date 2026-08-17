/**
 * Per-line heading backgrounds — real Chromium layout engine. LOCAL only.
 *
 * Owner, 2026-08-17: "Its not good, still its like a box. If there are 2 lines
 * background is like a box. I need separate small background for each line."
 *
 * Every shape before this one painted the heading element itself, and a block
 * can only ever draw ONE rectangle no matter how many lines it holds. The
 * "line" shape moves the paint onto the inline runs with
 * box-decoration-break:clone, so each visual line gets its own hugging box.
 *
 * That is a pure layout-engine behaviour — jsdom does not do line breaking or
 * box-decoration-break at all — so it can only be verified here. The shape is
 * applied to the live heading in-page rather than depending on what happens to
 * be configured, so the test asserts the stylesheet contract on any install.
 */
import { test, expect, type Page } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

/** Force a known two-line heading and a shape, then measure what is painted. */
async function measure(page: Page, shape: 'line' | 'hug') {
  return page.evaluate((s) => {
    const title = document.querySelector('.banner-title') as HTMLElement | null;
    if (!title) return null;

    // A heading long enough to wrap at every width under test.
    title.innerHTML = '<span class="hero-title-line">Dhivehi Breakfast and Artisan Baking Since 1998</span>';
    title.setAttribute('data-has-bg', '1');
    title.setAttribute('data-bg-shape', s);
    title.style.setProperty('--hero-el-bg', 'rgba(28,20,8,0.7)');
    title.getBoundingClientRect();

    const run = title.querySelector('.hero-title-line') as HTMLElement;
    // One client rect per VISUAL line — this is what soft wrapping produces.
    const rects = Array.from(run.getClientRects()).map((r) => ({
      width: Math.round(r.width),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
    }));

    return {
      block: Math.round(title.getBoundingClientRect().width),
      blockPainted: getComputedStyle(title).backgroundColor,
      runPainted: getComputedStyle(run).backgroundColor,
      rects,
    };
  }, shape);
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

test.describe('Per-line heading backgrounds', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of [320, 390, 414] as const) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test(`every line gets its own hugging box @ ${width}`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const m = await measure(page, 'line');
        test.skip(m === null, 'no hero slide configured on this install');

        // The heading itself must paint nothing — otherwise there is still one
        // big rectangle behind all the lines.
        expect(m!.blockPainted, 'the heading is still painting one box behind every line').toBe(TRANSPARENT);
        expect(m!.runPainted).not.toBe(TRANSPARENT);

        // The text must actually be wrapping, or this proves nothing.
        expect(m!.rects.length, 'heading did not wrap — test is not exercising the fault').toBeGreaterThan(1);

        // Each box hugs its own line, so the last (short) line must be clearly
        // narrower than the block. A single rectangle would span the full width.
        const last = m!.rects[m!.rects.length - 1];
        expect(
          last.width,
          `the final line's box is ${last.width}px in a ${m!.block}px block — it is not hugging its own line`,
        ).toBeLessThan(m!.block * 0.9);

        // And the boxes must be visibly separate, not stacked edge to edge —
        // touching boxes read as one shape again.
        for (let i = 1; i < m!.rects.length; i += 1) {
          const gap = m!.rects[i].top - m!.rects[i - 1].bottom;
          expect(gap, `line ${i} and ${i + 1} boxes touch (gap ${gap}px)`).toBeGreaterThan(0);
        }
      });

      test(`the one-box shape still draws a single box @ ${width}`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const m = await measure(page, 'hug');
        test.skip(m === null, 'no hero slide configured on this install');

        // The old shape must keep working — this is what existing slides use.
        expect(m!.blockPainted).not.toBe(TRANSPARENT);
        expect(m!.runPainted).toBe(TRANSPARENT);
      });
    });
  }
});
