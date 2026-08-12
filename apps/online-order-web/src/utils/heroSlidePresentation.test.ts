import { describe, expect, it } from 'vitest';
import {
  heroMediaOpacityMobile,
  isHeroSlideInScheduleWindow,
  legacyDimMediaOpacityMobile,
  resolveHeroSlidePresentation,
  restaurantLocalStamp,
  splitHeroRichTextLines,
} from './heroSlidePresentation';

describe('splitHeroRichTextLines', () => {
  it('splits on br and keeps inline markup', () => {
    expect(splitHeroRichTextLines('Where Dhivehi breakfast<br><em>meets</em> baking')).toEqual([
      'Where Dhivehi breakfast',
      '<em>meets</em> baking',
    ]);
  });

  it('returns a single line when there is no br', () => {
    expect(splitHeroRichTextLines('One line')).toEqual(['One line']);
  });
});

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

  it('absent element backgrounds keep css null (hardcoded look)', () => {
    const r = resolveHeroSlidePresentation({
      photo_brightness: 100,
      text_background: 100,
      title: 'T',
      image: '/shop.jpg',
    });
    expect(r.elements.title.css).toBeNull();
    expect(r.elements.eyebrow.css).toBeNull();
    expect(r.elements.subtitle.css).toBeNull();
    expect(r.elements.cta1.css).toBeNull();
    expect(r.elements.cta2.css).toBeNull();
  });

  it('resolves per-element bg colour + strength', () => {
    const r = resolveHeroSlidePresentation({
      title_bg: 'dark',
      title_bg_strength: 50,
      title_bg_full_width: false,
    });
    expect(r.elements.title.css).toBe('rgba(28,20,8,0.5)');
    expect(r.elements.title.full_width).toBe(false);
  });
});

describe('isHeroSlideInScheduleWindow', () => {
  it('both empty means always', () => {
    expect(isHeroSlideInScheduleWindow({})).toBe(true);
  });

  it('hides after show_until in restaurant timezone', () => {
    // Stamp comparison uses restaurant-local wall clock.
    const until = '2026-03-20';
    const during = new Date('2026-03-20T07:00:00Z'); // 12:00 Maldives
    const after = new Date('2026-03-20T20:00:00Z'); // 01:00 next day Maldives
    expect(isHeroSlideInScheduleWindow({ show_until: until }, during)).toBe(true);
    expect(isHeroSlideInScheduleWindow({ show_until: until }, after)).toBe(false);
  });

  it('hides before show_from', () => {
    const from = '2026-03-01T00:00';
    const before = new Date('2026-02-15T12:00:00+05:00');
    const after = new Date('2026-03-02T12:00:00+05:00');
    expect(isHeroSlideInScheduleWindow({ show_from: from }, before)).toBe(false);
    expect(isHeroSlideInScheduleWindow({ show_from: from }, after)).toBe(true);
  });

  it('restaurantLocalStamp is Maldives wall time', () => {
    const utc = new Date('2026-03-20T23:00:00Z');
    expect(restaurantLocalStamp(utc)).toBe('2026-03-21T04:00:00');
  });
});
