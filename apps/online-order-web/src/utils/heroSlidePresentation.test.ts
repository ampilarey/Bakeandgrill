import { describe, expect, it } from 'vitest';
import {
  headingLengthBand,
  heroMediaOpacityMobile,
  isHeroSlideInScheduleWindow,
  legacyDimMediaOpacityMobile,
  resolveHeroSlidePresentation,
  restaurantLocalStamp,
  splitHeroRichTextLines,
} from './heroSlidePresentation';

describe('glass element background', () => {
  it('maps strength to white fill opacity like secondary CTA at 10', () => {
    const r = resolveHeroSlidePresentation({
      title_bg: 'glass',
      title_bg_strength: 10,
      cta1_bg: 'glass',
      cta1_bg_strength: 10,
    });
    expect(r.elements.title.token).toBe('glass');
    expect(r.elements.title.css).toBe('rgba(255,255,255,0.1)');
    expect(r.elements.cta1.css).toBe('rgba(255,255,255,0.1)');
  });
});

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

/**
 * Hero heading fit — owner audit, 2026-08-16. Must stay in lockstep with
 * HeroSlides::headingLengthBand() and ['panelled'] on the PHP side, which is
 * covered by backend/tests/Unit/HeroHeadingFitTest.php with the same cases.
 */
describe('heading fit', () => {
  it('steps on plain-text length, at the same boundaries as PHP', () => {
    expect(headingLengthBand('')).toBe('');
    expect(headingLengthBand('Bake & Grill')).toBe('');
    expect(headingLengthBand('a'.repeat(26))).toBe('');
    expect(headingLengthBand('a'.repeat(27))).toBe('long');
    expect(headingLengthBand('a'.repeat(46))).toBe('long');
    expect(headingLengthBand('a'.repeat(47))).toBe('xlong');
    expect(headingLengthBand('Dhivehi Breakfast and Artisan Baking')).toBe('long');
  });

  it('ignores markup, line breaks and entities', () => {
    expect(headingLengthBand('<em><strong>Bake</strong></em> <span>Grill</span>')).toBe('');
    expect(headingLengthBand('Bake and Grill<br>Maldives Malé'))
      .toBe(headingLengthBand('Bake and Grill Maldives Malé'));
    expect(headingLengthBand('Bake &amp; Grill Mal&eacute;')).toBe('');
  });

  it('marks a slide panelled only when the heading or subheading has a real panel', () => {
    expect(resolveHeroSlidePresentation({ photo_brightness: 60, text_background: 70 }).panelled).toBe(false);
    expect(resolveHeroSlidePresentation({ title_bg: 'glass' }).panelled).toBe(true);
    expect(resolveHeroSlidePresentation({ subtitle_bg: 'dark', subtitle_bg_shape: 'hug' }).panelled).toBe(true);
    // A solid with no shape stored is a letter outline, not a box.
    expect(resolveHeroSlidePresentation({ subtitle_bg: 'dark' }).panelled).toBe(false);
    // "none" is transparent — no box to nest, so the gradient must stay.
    expect(resolveHeroSlidePresentation({ title_bg: 'none' }).panelled).toBe(false);
    // A pill on the eyebrow or a CTA button is not a nested panel.
    expect(resolveHeroSlidePresentation({ eyebrow_bg: 'glass' }).panelled).toBe(false);
    expect(resolveHeroSlidePresentation({ cta1_bg: 'glass' }).panelled).toBe(false);
  });

  it('lets the owner override the automatic rule in both directions', () => {
    // Default stays the behaviour the owner first approved.
    expect(resolveHeroSlidePresentation({}).copy_scrim_mode).toBe('auto');
    expect(resolveHeroSlidePresentation({ title_bg: 'glass' }).copy_scrim).toBe(false);

    // "Always" must beat the automatic rule, not merely lose to it.
    expect(resolveHeroSlidePresentation({ title_bg: 'glass', copy_scrim_mode: 'always' }).copy_scrim).toBe(true);
    // "Off" removes it even with no panel in play.
    expect(resolveHeroSlidePresentation({ text_background: 100, copy_scrim_mode: 'off' }).copy_scrim).toBe(false);

    // Messy stored values fall back rather than breaking the slide.
    expect(resolveHeroSlidePresentation({ copy_scrim_mode: '  Always ' }).copy_scrim_mode).toBe('always');
    expect(resolveHeroSlidePresentation({ copy_scrim_mode: 'nonsense' }).copy_scrim_mode).toBe('auto');
  });
});

/**
 * Background shape — owner, 2026-08-17: "If there are 2 lines background is
 * like a box. I need separate small background for each line." Lockstep with
 * HeroSlides::resolveElementShape(), same cases as HeroHeadingFitTest.
 */
describe('background shape', () => {
  const shapeOf = (slide: Record<string, unknown>, key: 'title' | 'subtitle' = 'title') =>
    resolveHeroSlidePresentation(slide).elements[key].shape;

  it('preserves the existing look when nothing is stored', () => {
    expect(shapeOf({ title_bg: 'glass' })).toBe('hug');
    expect(shapeOf({ title_bg: 'dark' })).toBe('outline');
    expect(shapeOf({ title_bg: '#123456' })).toBe('outline');
    expect(shapeOf({ title_bg: 'dark', title_bg_full_width: true })).toBe('full');
    expect(shapeOf({ title_bg: 'glass', title_bg_full_width: true })).toBe('full');
  });

  it('lets a stored shape win over the legacy flag, and tolerates mess', () => {
    expect(shapeOf({ title_bg: 'dark', title_bg_full_width: true, title_bg_shape: 'line' })).toBe('line');
    expect(shapeOf({ title_bg: 'dark', title_bg_shape: '  LINE ' })).toBe('line');
    expect(shapeOf({ title_bg: 'glass', title_bg_shape: 'wat' })).toBe('hug');
  });

  it('offers per-line to the subheading, but not to pills', () => {
    expect(shapeOf({ subtitle_bg: 'dark', subtitle_bg_shape: 'line' }, 'subtitle')).toBe('line');
    for (const key of ['eyebrow', 'cta1', 'cta2'] as const) {
      expect(resolveHeroSlidePresentation({ [`${key}_bg`]: 'glass' }).elements[key].shape).toBe('hug');
    }
  });

  it('treats an outline as no box, but per-line boxes as boxes', () => {
    // Nothing for the block shade to nest inside, so it stays.
    expect(resolveHeroSlidePresentation({ title_bg: 'dark' }).copy_scrim).toBe(true);
    // Small boxes are still boxes.
    expect(resolveHeroSlidePresentation({ title_bg: 'dark', title_bg_shape: 'line' }).copy_scrim).toBe(false);
  });
});
