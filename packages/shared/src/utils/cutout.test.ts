import { describe, expect, it } from 'vitest';
import { cutoutBackdropVars, hasCutout } from './cutout';

describe('cutoutBackdropVars', () => {
  it('turns a resolved backdrop into the two custom properties the cards read', () => {
    expect(cutoutBackdropVars({ color: '#112233', strength: 45 })).toEqual({
      '--cutout-color': '#112233',
      '--cutout-alpha': '0.45',
    });
  });

  it('falls back to the menu default for a missing or broken backdrop', () => {
    expect(cutoutBackdropVars(null)).toEqual({ '--cutout-color': '#F3EAE1', '--cutout-alpha': '1.00' });
    expect(cutoutBackdropVars({ color: 'red', strength: 250 })).toEqual({ '--cutout-color': '#F3EAE1', '--cutout-alpha': '1.00' });
  });
});

describe('hasCutout', () => {
  it('is true only for a non-empty cut-out url', () => {
    expect(hasCutout({ cutout_url: '/storage/menu-cutouts/a.png' })).toBe(true);
    expect(hasCutout({ cutout_url: '  ' })).toBe(false);
    expect(hasCutout({ cutout_url: null })).toBe(false);
    expect(hasCutout({})).toBe(false);
  });
});
