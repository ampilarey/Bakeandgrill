import { describe, expect, it } from 'vitest';

/**
 * Mirrors SiteSettingsContext.parseHeroSlides logic for parity with Blade HeroSlides::resolve.
 */
function parseHeroSlides(rawMap: Record<string, string | undefined>) {
  const arrayRaw = rawMap.hero_slides;
  if (arrayRaw) {
    try {
      const parsed = JSON.parse(arrayRaw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (slide) =>
            !!slide && typeof slide === 'object' && !!(slide as { title?: string }).title
            && String((slide as { title: string }).title).trim() !== '',
        );
      }
    } catch {
      /* fall through */
    }
  }
  const out: unknown[] = [];
  for (let i = 1; i <= 3; i++) {
    const raw = rawMap[`hero_slide_${i}`];
    if (!raw) continue;
    try {
      const slide = JSON.parse(raw) as { title?: string };
      if (slide?.title && String(slide.title).trim() !== '') out.push(slide);
    } catch { /* ignore */ }
  }
  return out;
}

describe('hero slides parse parity', () => {
  const slideA = { title: 'Title A', eyebrow: 'A' };
  const slideB = { title: 'Title B', eyebrow: 'B' };

  it('prefers hero_slides array over legacy keys', () => {
    const fromArray = parseHeroSlides({
      hero_slides: JSON.stringify([slideA, slideB]),
      hero_slide_1: JSON.stringify({ title: 'Legacy' }),
    });
    expect(fromArray).toHaveLength(2);
    expect((fromArray[0] as { title: string }).title).toBe('Title A');
  });

  it('falls back to hero_slide_1/2/3 when array empty', () => {
    const fromLegacy = parseHeroSlides({
      hero_slides: '[]',
      hero_slide_1: JSON.stringify(slideA),
      hero_slide_2: JSON.stringify(slideB),
    });
    expect(fromLegacy).toHaveLength(2);
    expect((fromLegacy[1] as { title: string }).title).toBe('Title B');
  });

  it('matches legacy-only and array-only titles (parity)', () => {
    const legacy = parseHeroSlides({
      hero_slide_1: JSON.stringify(slideA),
      hero_slide_2: JSON.stringify(slideB),
    });
    const array = parseHeroSlides({
      hero_slides: JSON.stringify([slideA, slideB]),
    });
    expect(legacy.map((s) => (s as { title: string }).title)).toEqual(
      array.map((s) => (s as { title: string }).title),
    );
  });
});
