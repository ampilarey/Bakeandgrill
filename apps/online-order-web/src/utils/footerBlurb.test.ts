import { describe, expect, it } from 'vitest';
import { FOOTER_THANKS_DEFAULT, normalizeFooterBlurb } from './footerBlurb';

describe('normalizeFooterBlurb', () => {
  it('uses tagline when footer_text is empty', () => {
    expect(normalizeFooterBlurb('', 'Fresh every day')).toBe('Fresh every day');
  });

  it('ignores legacy copyright footer_text', () => {
    expect(
      normalizeFooterBlurb('© 2026 Bake & Grill. All rights reserved.', 'Fresh every day'),
    ).toBe('Fresh every day');
  });

  it('keeps a real blurb', () => {
    expect(normalizeFooterBlurb('Grill favourites, baked fresh.', 'Tagline')).toBe(
      'Grill favourites, baked fresh.',
    );
  });

  it('exports the shared thanks default', () => {
    expect(FOOTER_THANKS_DEFAULT).toContain('Bake & Grill');
  });
});
