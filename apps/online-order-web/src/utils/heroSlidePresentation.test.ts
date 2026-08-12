import { describe, expect, it } from 'vitest';
import {
  heroMediaOpacityMobile,
  legacyDimMediaOpacityMobile,
  resolveHeroSlidePresentation,
} from './heroSlidePresentation';

describe('resolveHeroSlidePresentation', () => {
  it.each([
    [0, 1, 0],
    [50, 0.5, 0.5],
    [100, 0, 1],
  ] as const)('legacy dim %s maps to identical mobile opacity', (dim, photo, scrim) => {
    const r = resolveHeroSlidePresentation({ dim });
    expect(r.photo).toBe(photo);
    expect(r.scrim).toBe(scrim);
    expect(heroMediaOpacityMobile(r.photo)).toBeCloseTo(legacyDimMediaOpacityMobile(dim), 5);
    expect(r.text_position).toBe('bottom');
  });

  it('allows bright photo with strong scrim (impossible under single dim)', () => {
    const r = resolveHeroSlidePresentation({
      photo_brightness: 100,
      text_background: 100,
    });
    expect(r.photo).toBe(1);
    expect(r.scrim).toBe(1);
    expect(heroMediaOpacityMobile(r.photo)).toBeGreaterThan(0.9);
  });

  it('defaults text position to bottom; accepts top/middle', () => {
    expect(resolveHeroSlidePresentation({}).text_position).toBe('bottom');
    expect(resolveHeroSlidePresentation({ text_position: 'top' }).text_position).toBe('top');
    expect(resolveHeroSlidePresentation({ text_position: 'middle' }).text_position).toBe('middle');
  });

  it('treats absent fields like legacy dim 100', () => {
    const r = resolveHeroSlidePresentation({});
    expect(r.photo).toBe(0);
    expect(r.scrim).toBe(1);
  });
});
