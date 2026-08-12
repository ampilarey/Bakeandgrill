import { describe, expect, it } from 'vitest';
import {
  formatHeroSlideScheduleLabel,
  isHeroSlideInScheduleWindow,
  resolveHeroSlidePresentation,
  withHeroPresentationFields,
} from '../utils/heroSlidePresentation';

describe('admin heroSlidePresentation', () => {
  it('maps legacy dim identically to order-app / PHP', () => {
    expect(resolveHeroSlidePresentation({ dim: 0 })).toMatchObject({ photo: 1, scrim: 0 });
    expect(resolveHeroSlidePresentation({ dim: 50 })).toMatchObject({ photo: 0.5, scrim: 0.5 });
    expect(resolveHeroSlidePresentation({ dim: 100 })).toMatchObject({ photo: 0, scrim: 1 });
  });

  it('strips dim when writing new fields', () => {
    const next = withHeroPresentationFields(
      { dim: 100, title: 'T', photo_brightness: 0, text_background: 100 },
      { photo_brightness: 100, text_background: 100 },
    );
    expect(next.photo_brightness).toBe(100);
    expect(next.text_background).toBe(100);
    expect('dim' in next).toBe(false);
  });

  it('absent element bg leaves hardcoded look (css null)', () => {
    const r = resolveHeroSlidePresentation({
      photo_brightness: 100,
      text_background: 100,
      title: 'Shop front',
      image: '/storage/hero.jpg',
    });
    expect(r.elements.title.css).toBeNull();
    expect(r.elements.subtitle.css).toBeNull();
  });

  it('persists and clears per-element backgrounds', () => {
    const withBg = withHeroPresentationFields(
      { title: 'T' } as Record<string, unknown>,
      { title_bg: 'dark', title_bg_strength: 60 },
    );
    expect(withBg.title_bg).toBe('dark');
    expect(withBg.title_bg_strength).toBe(60);
    const cleared = withHeroPresentationFields(withBg, { title_bg: null });
    expect('title_bg' in cleared).toBe(false);
    expect('title_bg_strength' in cleared).toBe(false);
  });

  it('schedule label is plain language', () => {
    expect(formatHeroSlideScheduleLabel({})).toBe('Always showing');
    expect(formatHeroSlideScheduleLabel({ showing: false, show_until: '2026-03-20' }))
      .toBe('Hidden — dates ignored while Hidden');
    expect(formatHeroSlideScheduleLabel({ show_until: '2026-03-20' })).toMatch(/Showing until/);
  });

  it('schedule window matches order-app / PHP rules', () => {
    expect(isHeroSlideInScheduleWindow({})).toBe(true);
    const during = new Date('2026-03-20T07:00:00Z');
    const after = new Date('2026-03-20T20:00:00Z');
    expect(isHeroSlideInScheduleWindow({ show_until: '2026-03-20' }, during)).toBe(true);
    expect(isHeroSlideInScheduleWindow({ show_until: '2026-03-20' }, after)).toBe(false);
  });
});
