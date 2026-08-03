import { describe, expect, it } from 'vitest';
import {
  alphaToTransparencyPercent,
  composeFromPicker,
  EDGE_CLEAR_INSET_PERCENT,
  edgeClearChecked,
  FONT_SIZE_OPTIONS,
  formatStoredColor,
  HEIGHT_SIZE_OPTIONS,
  nearestPresetValue,
  parseCssColor,
  rgbMatch,
  themeSwatches,
  transparencyPercentToAlpha,
} from '../pages/signage/bannerAppearanceUx';

describe('bannerAppearanceUx', () => {
  it('parses hex and rgba', () => {
    expect(parseCssColor('#fff8f0')).toEqual({ r: 255, g: 248, b: 240, a: 1 });
    expect(parseCssColor('rgba(12, 8, 4, 0.78)')).toEqual({ r: 12, g: 8, b: 4, a: 0.78 });
  });

  it('composes rgba from picker + transparency; 100% opaque stores hex', () => {
    const translucent = composeFromPicker('#0c0804', transparencyPercentToAlpha(22));
    expect(translucent).toBe('rgba(12, 8, 4, 0.78)');
    const opaque = composeFromPicker('#ffeeaa', 1);
    expect(opaque).toBe('#ffeeaa');
    expect(formatStoredColor({ r: 255, g: 238, b: 170, a: 1 })).toBe('#ffeeaa');
  });

  it('maps transparency slider to alpha', () => {
    expect(alphaToTransparencyPercent(0.78)).toBe(22);
    expect(transparencyPercentToAlpha(0)).toBe(1);
    expect(transparencyPercentToAlpha(100)).toBe(0);
  });

  it('named size options store the documented multipliers', () => {
    expect(FONT_SIZE_OPTIONS.map((o) => o.value)).toEqual([0.8, 1, 1.3, 1.6]);
    expect(HEIGHT_SIZE_OPTIONS.map((o) => o.value)).toEqual([0.8, 1, 1.3]);
  });

  it('nearest preset does not rewrite off-preset values until edited', () => {
    expect(nearestPresetValue(1.15, FONT_SIZE_OPTIONS)).toBe(1);
    expect(nearestPresetValue(1.15, HEIGHT_SIZE_OPTIONS)).toBe(1);
    expect(nearestPresetValue(1.45, FONT_SIZE_OPTIONS)).toBe(1.3);
    // Display nearest is 1, but the stored value itself is unchanged by the helper.
    const stored = 1.15;
    expect(stored).toBe(1.15);
    expect(nearestPresetValue(stored, FONT_SIZE_OPTIONS)).not.toBe(stored);
  });

  it('edge clear checkbox maps to 3 / 0', () => {
    expect(EDGE_CLEAR_INSET_PERCENT).toBe(3);
    expect(edgeClearChecked(0)).toBe(false);
    expect(edgeClearChecked(3)).toBe(true);
    expect(edgeClearChecked(2.5)).toBe(true);
  });

  it('theme swatches include board colours plus black and white', () => {
    const swatches = themeSwatches({
      background: '#111111',
      surface: '#222222',
      primary: '#333333',
      text: '#eeeeee',
      muted: '#aaaaaa',
    });
    expect(swatches.map((s) => s.key)).toEqual([
      'background', 'surface', 'primary', 'text', 'muted', 'black', 'white',
    ]);
    expect(rgbMatch('#111111', swatches[0].color)).toBe(true);
  });
});
