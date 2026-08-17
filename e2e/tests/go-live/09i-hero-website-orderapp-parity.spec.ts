/**
 * The same slide must look the same in both apps. LOCAL only.
 *
 * The hero is rendered twice from one stored slide — the website by Blade and
 * PHP, the Order App by React and TypeScript — with the decisions duplicated in
 * two resolvers that have to agree. Every hero fault in this area came from the
 * two drifting apart, and each new setting doubles the surface for that.
 *
 * Rather than re-assert every rule, this compares what the two actually render
 * for the same slide: the resolved shape, motion, alignment and the whole set
 * of style custom properties. If a setting is wired into one app and forgotten
 * in the other, these stop matching.
 */
import { test, expect, type Page } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

type HeroFacts = {
  shape: string | null;
  anim: string | null;
  align: string | null;
  boxAnim: string | null;
  photoAnim: string | null;
  vars: Record<string, string>;
};

/** Read a hero's resolved decisions, whichever app drew it. */
async function readHero(page: Page, titleSel: string, slideSel: string): Promise<HeroFacts | null> {
  return page.evaluate(
    ([t, sl]) => {
      const title = document.querySelector(t) as HTMLElement | null;
      if (!title) return null;
      const slide = document.querySelector(sl) as HTMLElement | null;

      // Only the properties the renderer chose to emit — an unset setting must
      // be absent in both apps, not defaulted differently in each.
      const vars: Record<string, string> = {};
      for (const decl of (title.getAttribute('style') ?? '').split(';')) {
        const [k, ...rest] = decl.split(':');
        if (k && k.trim().startsWith('--hero-el-')) vars[k.trim()] = rest.join(':').trim();
      }

      return {
        shape: title.getAttribute('data-bg-shape'),
        anim: title.getAttribute('data-anim'),
        align: title.getAttribute('data-align'),
        boxAnim: title.getAttribute('data-box-anim'),
        photoAnim: slide?.getAttribute('data-photo-anim') ?? null,
        vars,
      };
    },
    [titleSel, slideSel] as const,
  );
}

test.describe('Website and Order App hero parity', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  test.use({ viewport: { width: 390, height: 900 } });

  test('both apps resolve the same slide to the same look', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const website = await readHero(page, '.banner-title', '.banner-slide');
    test.skip(website === null, 'no hero slide configured on this install');

    await page.goto('/order/', { waitUntil: 'networkidle' });
    // The Order App hero is client-rendered from the settings API.
    await page.waitForSelector('.home-promo-hero__title', { timeout: 20_000 });
    const orderApp = await readHero(page, '.home-promo-hero__title', '.home-promo-hero__slide');
    test.skip(orderApp === null, 'the Order App hero did not render on this install');

    expect(orderApp!.shape, 'background shape differs between the apps').toBe(website!.shape);
    expect(orderApp!.anim, 'text animation differs between the apps').toBe(website!.anim);
    expect(orderApp!.align, 'alignment differs between the apps').toBe(website!.align);
    expect(orderApp!.boxAnim, 'box movement differs between the apps').toBe(website!.boxAnim);
    expect(orderApp!.photoAnim, 'photo movement differs between the apps').toBe(website!.photoAnim);

    // Same properties, same values — including which ones are absent.
    expect(Object.keys(orderApp!.vars).sort(), 'the two apps emit different style properties')
      .toEqual(Object.keys(website!.vars).sort());
    expect(orderApp!.vars, 'the two apps emit different style values').toEqual(website!.vars);
  });
});
