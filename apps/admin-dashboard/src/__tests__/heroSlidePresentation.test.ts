import { describe, expect, it } from 'vitest';
import {
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
});
