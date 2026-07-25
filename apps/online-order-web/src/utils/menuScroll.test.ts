import { describe, expect, it } from 'vitest';
import { categoryScrollTop } from './menuScroll';

describe('categoryScrollTop', () => {
  it('places section top just under the sticky bar', () => {
    // section 400px from viewport top, page scrolled 200, sticky 160 → land at 436
    expect(categoryScrollTop(400, 200, 160, 4)).toBe(436);
  });

  it('never returns a negative scroll position', () => {
    expect(categoryScrollTop(50, 0, 160, 4)).toBe(0);
  });
});
