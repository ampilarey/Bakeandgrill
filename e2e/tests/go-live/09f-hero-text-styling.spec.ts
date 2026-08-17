/**
 * Hero text styling in a real engine — LOCAL only.
 *
 * Owner, 2026-08-17: "there is font outline options but when background is
 * selected cant add font outline and its color is limited … can't select font
 * color. Need to change normal font color and <em> part font color."
 *
 * The headline claim to prove is the one that was structurally impossible
 * before: a background box and a letter outline on the same heading, in two
 * different colours. Computed style is the only place that can be checked —
 * jsdom reports neither -webkit-text-stroke nor a resolved gradient.
 *
 * Styles are applied to the live heading in-page rather than depending on what
 * is configured, so this asserts the stylesheet contract on any install.
 */
import { test, expect, type Page } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/** Apply the owner's settings the way the renderer does, then read them back. */
async function styleAndMeasure(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector('.banner-title') as HTMLElement | null;
    if (!title) return null;

    title.innerHTML = '<span class="hero-title-line">Dhivehi <em>Breakfast</em> and Baking</span>';
    title.setAttribute('data-has-bg', '1');
    title.setAttribute('data-bg-shape', 'line');
    title.setAttribute('data-outline', '1');
    title.setAttribute('data-border', '1');
    const vars: Record<string, string> = {
      '--hero-el-bg': 'linear-gradient(90deg, rgba(28,20,8,0.7), #4a2c12)',
      '--hero-el-text': '#ffffff',
      '--hero-el-em': '#f5a623',
      '--hero-el-outline': '#000000',
      '--hero-el-outline-w': '0.03em',
      '--hero-el-border': '#f5a623',
      '--hero-el-border-w': '3px',
      '--hero-el-radius': '18px',
      '--hero-el-scale': '1.25',
      '--hero-el-weight': '900',
    };
    for (const [k, v] of Object.entries(vars)) title.style.setProperty(k, v);

    const run = title.querySelector('.hero-title-line') as HTMLElement;
    const em = title.querySelector('em') as HTMLElement;
    const t = getComputedStyle(title);
    const r = getComputedStyle(run);

    return {
      textColor: t.color,
      emColor: getComputedStyle(em).color,
      weight: t.fontWeight,
      fontSizePx: parseFloat(t.fontSize),
      strokeColor: (r as unknown as Record<string, string>).webkitTextStrokeColor,
      strokeWidthPx: parseFloat((r as unknown as Record<string, string>).webkitTextStrokeWidth || '0'),
      runBackground: r.backgroundImage,
      borderColor: r.borderTopColor,
      borderWidthPx: parseFloat(r.borderTopWidth),
      radius: r.borderTopLeftRadius,
    };
  });
}

/**
 * Size with the scale forced to 1. The install under test may already carry a
 * scale of its own, so reading the raw size would compare against the wrong
 * number and the assertion would pass or fail by accident.
 */
async function baselineFontSize(page: Page) {
  return page.evaluate(() => {
    const t = document.querySelector('.banner-title') as HTMLElement | null;
    if (!t) return null;
    const had = t.style.getPropertyValue('--hero-el-scale');
    t.style.setProperty('--hero-el-scale', '1');
    const size = parseFloat(getComputedStyle(t).fontSize);
    if (had) t.style.setProperty('--hero-el-scale', had);
    else t.style.removeProperty('--hero-el-scale');
    return size;
  });
}

test.describe('Hero text styling', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  for (const width of [390, 1280] as const) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 950 } });

      test(`a box and a letter outline coexist in different colours @ ${width}`, async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const base = await baselineFontSize(page);
        const m = await styleAndMeasure(page);
        test.skip(m === null, 'no hero slide configured on this install');

        // The request in one assertion: a painted box AND a letter outline,
        // each in its own colour. Neither was possible with the other before.
        expect(m!.runBackground, 'the box is not painting a gradient').toContain('linear-gradient');
        expect(m!.strokeColor, 'the letter outline is missing over a box').toBe('rgb(0, 0, 0)');
        expect(m!.borderColor).toBe('rgb(245, 166, 35)');
        expect(m!.strokeColor).not.toBe(m!.borderColor);

        // Text and its <em> part take separate colours.
        expect(m!.textColor).toBe('rgb(255, 255, 255)');
        expect(m!.emColor).toBe('rgb(245, 166, 35)');
        expect(m!.emColor).not.toBe(m!.textColor);

        // Geometry and type.
        expect(m!.weight).toBe('900');
        expect(m!.radius).toBe('18px');
        expect(m!.borderWidthPx).toBeCloseTo(3, 0);
        expect(m!.strokeWidthPx).toBeGreaterThan(0);

        // Size scales the base rather than replacing it, so the shrink-to-fit
        // steps keep working underneath.
        expect(m!.fontSizePx).toBeCloseTo(base! * 1.25, 0);
      });
    });
  }

  test.describe('alignment', () => {
    test.use({ viewport: { width: 390, height: 950 } });

    test('the copy stack can be pushed left or right', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      const read = (align: string) =>
        page.evaluate((a) => {
          const ov = document.querySelector('.banner-overlay') as HTMLElement | null;
          if (!ov) return null;
          ov.setAttribute('data-text-align', a);
          const copy = ov.querySelector('.banner-copy') as HTMLElement | null;
          return {
            overlay: getComputedStyle(ov).alignItems,
            copy: copy ? getComputedStyle(copy).alignItems : null,
            text: getComputedStyle(ov).textAlign,
          };
        }, align);

      const left = await read('left');
      test.skip(left === null, 'no hero slide configured on this install');
      expect(left!.overlay).toBe('flex-start');
      expect(left!.copy).toBe('flex-start');
      expect(left!.text).toBe('left');

      const right = await read('right');
      expect(right!.overlay).toBe('flex-end');
      expect(right!.text).toBe('right');

      const centre = await read('center');
      expect(centre!.overlay).toBe('center');
    });
  });

  test.describe('no regression', () => {
    test.use({ viewport: { width: 390, height: 950 } });

    test('an unstyled heading keeps the stylesheet defaults', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      const m = await page.evaluate(() => {
        const t = document.querySelector('.banner-title') as HTMLElement | null;
        if (!t) return null;
        // Strip everything the owner could have set.
        for (const a of ['data-has-bg', 'data-bg-shape', 'data-outline', 'data-border', 'data-bg-glass']) {
          t.removeAttribute(a);
        }
        t.removeAttribute('style');
        const c = getComputedStyle(t);
        return { color: c.color, weight: c.fontWeight, bg: c.backgroundColor };
      });
      test.skip(m === null, 'no hero slide configured on this install');

      // White, 800, no box — exactly what it was before any of this existed.
      expect(m!.color).toBe('rgb(255, 255, 255)');
      expect(m!.weight).toBe('800');
      expect(m!.bg).toBe(TRANSPARENT);
    });
  });
});
