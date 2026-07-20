import { describe, expect, it } from 'vitest';
import { cartHasCateringItem } from '../pages/eventOrderHelpers';

/** Mirrors ItemSheet visibility rule for catering secondary link. */
function showEventLink(item: { is_catering?: boolean }, isEdit: boolean): boolean {
  return item.is_catering === true && !isEdit;
}

describe('dual-workflow UX rules', () => {
  it('shows ItemSheet event link only for catering items (not edit mode)', () => {
    expect(showEventLink({ is_catering: true }, false)).toBe(true);
    expect(showEventLink({ is_catering: false }, false)).toBe(false);
    expect(showEventLink({ is_catering: true }, true)).toBe(false);
    expect(showEventLink({}, false)).toBe(false);
  });

  it('cart banner appears/disappears with catering cart contents', () => {
    expect(cartHasCateringItem([{ item: { is_catering: true } }, { item: {} }])).toBe(true);
    expect(cartHasCateringItem([{ item: { is_catering: false } }])).toBe(false);
  });
});
