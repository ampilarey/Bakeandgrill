import { describe, expect, it } from 'vitest';
import {
  isRenderableHeroSlide,
  parseHeroSlides,
} from '../context/SiteSettingsContext';

/**
 * Parity with Blade HeroSlides::resolve / isRenderableSlide.
 */
describe('hero slides parse parity', () => {
  const slideA = { title: 'Title A', eyebrow: 'A', image: '/a.jpg' };
  const slideB = { title: 'Title B', eyebrow: 'B', image: '/b.jpg' };

  it('prefers hero_slides array over legacy keys', () => {
    const fromArray = parseHeroSlides({
      hero_slides: JSON.stringify([slideA, slideB]),
      hero_slide_1: JSON.stringify({ title: 'Legacy' }),
    });
    expect(fromArray).toHaveLength(2);
    expect(fromArray[0]?.title).toBe('Title A');
  });

  it('empty hero_slides array does not resurrect legacy keys', () => {
    const fromEmpty = parseHeroSlides({
      hero_slides: '[]',
      hero_slide_1: JSON.stringify(slideA),
      hero_slide_2: JSON.stringify(slideB),
    });
    expect(fromEmpty).toHaveLength(0);
  });

  it('matches legacy-only and array-only titles (parity)', () => {
    const legacy = parseHeroSlides({
      hero_slide_1: JSON.stringify(slideA),
      hero_slide_2: JSON.stringify(slideB),
    });
    const array = parseHeroSlides({
      hero_slides: JSON.stringify([slideA, slideB]),
    });
    expect(legacy.map((s) => s.title)).toEqual(array.map((s) => s.title));
  });

  it('skips slides with showing: false', () => {
    const slides = parseHeroSlides({
      hero_slides: JSON.stringify([
        { ...slideA, showing: false },
        { ...slideB, showing: true },
      ]),
    });
    expect(slides).toHaveLength(1);
    expect(slides[0]?.title).toBe('Title B');
  });

  it('treats absent showing flag as visible', () => {
    expect(isRenderableHeroSlide({ title: 'Open', image: '/x.jpg' })).toBe(true);
    expect(isRenderableHeroSlide({ title: 'Open', image: '/x.jpg', showing: true })).toBe(true);
    expect(isRenderableHeroSlide({ title: 'Hidden', image: '/x.jpg', showing: false })).toBe(false);
  });

  it('hiding every slide yields empty list (same as zero slides)', () => {
    const slides = parseHeroSlides({
      hero_slides: JSON.stringify([
        { ...slideA, showing: false },
        { ...slideB, showing: false },
      ]),
    });
    expect(slides).toEqual([]);
  });
});
