/**
 * Hero text styling — TypeScript side, held to the same behaviour as PHP.
 *
 * The website renders from HeroSlides::elementStyleVars() and the Order App
 * from heroElementStyleVars(); if they drift the same slide looks different in
 * the two places, which is exactly the class of bug the owner keeps finding.
 * Cases mirror backend/tests/Unit/HeroElementStyleTest.php.
 */
import { describe, expect, it } from 'vitest';

import { heroContrast } from '../utils/heroContrast';
import { heroElementStyleVars, resolveHeroElementStyle, resolveHeroTextAlign } from '../utils/heroSlidePresentation';
import { normalizeHex } from '../components/content-editors/heroSlides/HeroColorField';

describe('hero element style', () => {
  it('sets nothing at all on an unstyled element', () => {
    expect(heroElementStyleVars({}, 'title')).toEqual({});
  });

  it('keeps an old slide looking exactly as it did', () => {
    const vars = heroElementStyleVars({ title_bg: 'dark' }, 'title');
    expect(Object.keys(vars)).toEqual(['--hero-el-bg', '--hero-el-outline', '--hero-el-outline-w']);
    expect(vars['--hero-el-outline']).toBe(vars['--hero-el-bg']);
  });

  it('lets a box carry a letter outline in its own colour', () => {
    const st = resolveHeroElementStyle(
      {
        title_bg: 'dark',
        title_bg_shape: 'hug',
        title_outline: '1',
        title_outline_color: '#ff0000',
        title_border: '1',
        title_border_color: '#00ff00',
      },
      'title',
    );
    expect(st.outline).toBe(true);
    expect(st.outline_color).toBe('#ff0000');
    expect(st.border).toBe(true);
    expect(st.border_color).toBe('#00ff00');
  });

  it('lets an explicit off beat the shape that used to imply the outline', () => {
    expect(
      resolveHeroElementStyle({ title_bg: 'dark', title_bg_shape: 'outline', title_outline: '0' }, 'title').outline,
    ).toBe(false);
  });

  it('blends a second colour into a gradient, matching PHP exactly', () => {
    expect(
      heroElementStyleVars(
        { title_bg: '#000000', title_bg_strength: 100, title_bg_color2: '#ffffff', title_bg_angle: 90 },
        'title',
      )['--hero-el-bg'],
    ).toBe('linear-gradient(90deg, rgba(0,0,0,1), #ffffff)');
  });

  it.each([
    'red; background: url(javascript:alert(1))',
    '#fff} .x { display: none',
    'expression(alert(1))',
    'url(https://evil.test/x.png)',
    'red',
    '#abcd',
    'ffffff',
    '',
  ])('drops a colour that is not a colour: %s', (raw) => {
    expect(resolveHeroElementStyle({ title_text_color: raw }, 'title').text_color).toBeNull();
  });

  it('accepts short hex and rgba', () => {
    expect(resolveHeroElementStyle({ title_text_color: '#ABC' }, 'title').text_color).toBe('#abc');
    expect(resolveHeroElementStyle({ title_text_color: 'rgba(1,2,3,0.5)' }, 'title').text_color).toBe('rgba(1,2,3,0.5)');
  });

  it('clamps out-of-range numbers the same way PHP does', () => {
    expect(resolveHeroElementStyle({ title_font_scale: 5 }, 'title').font_scale).toBe('0.5');
    expect(resolveHeroElementStyle({ title_font_scale: 9999 }, 'title').font_scale).toBe('2');
    expect(resolveHeroElementStyle({ title_font_weight: 733 }, 'title').font_weight).toBe(700);
    expect(resolveHeroElementStyle({ title_font_weight: 5000 }, 'title').font_weight).toBe(900);
    expect(resolveHeroElementStyle({ title_font_weight: -20 }, 'title').font_weight).toBe(100);
  });

  it('maps a 0-100 slider onto a length, and falls back on nonsense', () => {
    expect(resolveHeroElementStyle({ title_bg_radius: 0 }, 'title').radius).toBe('0px');
    expect(resolveHeroElementStyle({ title_bg_radius: 100 }, 'title').radius).toBe('40px');
    expect(resolveHeroElementStyle({ title_bg_radius: 'wide' }, 'title').radius).toBeNull();
    expect(resolveHeroElementStyle({ title_font_scale: 'big' }, 'title').font_scale).toBeNull();
  });

  it('resolves text alignment and falls back', () => {
    expect(resolveHeroTextAlign({})).toBe('center');
    expect(resolveHeroTextAlign({ text_align: 'left' })).toBe('left');
    expect(resolveHeroTextAlign({ text_align: 'RIGHT' })).toBe('right');
    expect(resolveHeroTextAlign({ text_align: '  left ' })).toBe('left');
    expect(resolveHeroTextAlign({ text_align: 'diagonal' })).toBe('center');
  });
});

describe('colour field', () => {
  it('expands short hex so the native picker agrees with the text field', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#a1b2c3')).toBe('#a1b2c3');
    expect(normalizeHex('nonsense')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe('contrast warning', () => {
  it('calls out an unreadable pairing', () => {
    // Gold on cream — the classic mistake free colour choice makes easy.
    const v = heroContrast('#f5a623', 'rgba(255,248,240,1)');
    expect(v?.level).toBe('poor');
    expect(v?.message).toContain('Hard to read');
  });

  it('passes a strong pairing', () => {
    expect(heroContrast('#ffffff', 'rgba(28,20,8,1)')?.level).toBe('good');
  });

  it('flags the middle band as heading-only', () => {
    const v = heroContrast('#ffffff', 'rgba(120,120,120,1)');
    expect(v?.level).toBe('ok');
  });

  it('accounts for translucency rather than judging the raw colour', () => {
    // A 10%-alpha dark box is nearly the photo behind it, so white text on it
    // is far weaker than the same colour at full opacity would suggest.
    const faint = heroContrast('#ffffff', 'rgba(28,20,8,0.1)');
    const solid = heroContrast('#ffffff', 'rgba(28,20,8,1)');
    expect(faint!.ratio).toBeLessThan(solid!.ratio);
  });

  it('says nothing when there is no box to judge against', () => {
    // Text straight on a photo cannot be measured, and a made-up number would
    // be worse than silence.
    expect(heroContrast('#ffffff', null)).toBeNull();
  });
});
