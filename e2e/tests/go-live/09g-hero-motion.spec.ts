/**
 * Hero motion — real Chromium. LOCAL only.
 *
 * Owner asked for animation on both the text and the background (2026-08-17)
 * and picked every option offered. Two things here can only be checked by a
 * real engine, and both bit during the build:
 *
 * Motion became a per-PART setting on 2026-08-17 ("Setting that can be
 * separated make it separate for each part"), so these attributes sit on the
 * heading and subheading rather than on the overlay.
 *
 *  1. An element carries ONE `animation` property, and an entrance and a
 *     looping box effect both want it. The first cut lost the box effect to the
 *     entrance on specificity — choosing Glow with the one-box shape did
 *     nothing at all, silently. The rules now compose the two, and this asserts
 *     that both names survive together, on both shapes.
 *  2. prefers-reduced-motion must stop all of it. That is a media query, so
 *     jsdom cannot see it.
 */
import { test, expect, type Page } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

type Probe = { title: string; run: string; photo: string };

/** Set the motion attributes the renderer sets, then read the animations back. */
async function probe(
  page: Page,
  opts: { text?: string; box?: string; photo?: string; shape?: string },
): Promise<Probe | null> {
  return page.evaluate((o) => {
    const title = document.querySelector('.banner-title') as HTMLElement | null;
    const slide = document.querySelector('.banner-slide') as HTMLElement | null;
    if (!title || !slide) return null;

    // Motion hangs off the part itself now, not the overlay.
    title.setAttribute('data-anim', o.text ?? 'fade');
    title.setAttribute('data-has-bg', '1');
    title.setAttribute('data-bg-shape', o.shape ?? 'line');
    title.style.setProperty('--hero-el-bg', 'rgba(28,20,8,0.7)');
    if (o.box) title.setAttribute('data-box-anim', o.box);
    else title.removeAttribute('data-box-anim');
    slide.setAttribute('data-photo-anim', o.photo ?? 'none');

    const media = slide.querySelector('img, .banner-video');
    const name = (el: Element | null) => (el ? getComputedStyle(el).animationName : '');

    return {
      title: name(title),
      run: name(title.querySelector('.hero-title-line')),
      photo: name(media),
    };
  }, opts);
}

test.describe('Hero motion', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  test.use({ viewport: { width: 390, height: 900 } });

  test('each text arrival binds its own animation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const none = await probe(page, { text: 'none' });
    test.skip(none === null, 'no hero slide configured on this install');
    // "None" must actively stop the stylesheet's own long-standing fade.
    expect(none!.title).toBe('none');

    expect((await probe(page, { text: 'fade' }))!.title).toContain('hero-fade-up');
    expect((await probe(page, { text: 'zoom' }))!.title).toContain('hero-zoom-in');
    // Line by line staggers the runs, not the heading as a whole.
    expect((await probe(page, { text: 'line' }))!.run).toContain('hero-fade-up');
  });

  for (const shape of ['line', 'hug'] as const) {
    test(`a box effect runs alongside the entrance on the ${shape} shape`, async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });

      for (const box of ['glow', 'drift', 'sheen'] as const) {
        const p = await probe(page, { text: 'fade', box, shape });
        test.skip(p === null, 'no hero slide configured on this install');

        // Assert on whichever element actually PAINTS the box — the inline run
        // for the per-line shape, the heading itself for one-box. Accepting
        // either would let the defect through: the run kept its animation while
        // the heading silently lost it.
        const painted = shape === 'line' ? p!.run : p!.title;
        expect(painted, `${box} on the ${shape} shape is not running`).toContain(`hero-box-${box}`);
        expect(painted, `${box} on the ${shape} shape swallowed the entrance`).toContain('hero-fade-up');
      }
    });
  }

  test('the heading and subheading can animate differently', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const r = await page.evaluate(() => {
      const title = document.querySelector('.banner-title') as HTMLElement | null;
      const sub = document.querySelector('.banner-sub') as HTMLElement | null;
      if (!title || !sub) return null;

      // The whole point of splitting motion per part: these differ.
      title.setAttribute('data-anim', 'zoom');
      sub.setAttribute('data-anim', 'fade');
      title.setAttribute('data-align', 'left');
      sub.setAttribute('data-align', 'right');

      const cs = (e: HTMLElement) => getComputedStyle(e);
      return {
        titleAnim: cs(title).animationName,
        subAnim: cs(sub).animationName,
        titleAlign: cs(title).textAlign,
        subAlign: cs(sub).textAlign,
        titleSelf: cs(title).alignSelf,
        subSelf: cs(sub).alignSelf,
      };
    });
    test.skip(r === null, 'no hero slide configured on this install');

    expect(r!.titleAnim).toContain('hero-zoom-in');
    expect(r!.subAnim).toContain('hero-fade-up');
    expect(r!.titleAnim).not.toBe(r!.subAnim);

    // Alignment is per part too, so a heading can sit left of its subheading.
    expect(r!.titleAlign).toBe('left');
    expect(r!.subAlign).toBe('right');
    expect(r!.titleSelf).toBe('flex-start');
    expect(r!.subSelf).toBe('flex-end');
  });

  test('the photo can zoom or pan, and stop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const z = await probe(page, { photo: 'zoom' });
    test.skip(z === null, 'no hero slide configured on this install');

    expect(z!.photo).toContain('hero-photo-zoom');
    expect((await probe(page, { photo: 'pan' }))!.photo).toContain('hero-photo-pan');
    expect((await probe(page, { photo: 'none' }))!.photo).toBe('none');
  });

  test.describe('reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('a viewer who asked for less motion gets none of it', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      const p = await probe(page, { text: 'word', box: 'sheen', photo: 'zoom', shape: 'hug' });
      test.skip(p === null, 'no hero slide configured on this install');

      // The owner's choice does not override the viewer's accessibility setting.
      expect(p!.title).toBe('none');
      expect(p!.run).toBe('none');
      expect(p!.photo).toBe('none');
    });
  });
});
