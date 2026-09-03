import { describe, expect, it } from 'vitest';
import { emptyItemForm, formToPayload } from './menuItemForm';

/**
 * Owner, 2026-09-03: Black Tea's sizes were switched off in the editor but
 * kept showing in the quick-edit sheet. The payload must say "no sizes" out
 * loud (an empty list), not stay silent, or the server leaves them in place.
 */
describe('formToPayload with sizes switched off', () => {
  it('sends an empty variants list so the server removes the old sizes', () => {
    const form = {
      ...emptyItemForm(1),
      name: 'Black Tea',
      base_price: '12',
      has_variants: false,
      variants: [{ _key: 'a', id: 5, name: 'Small', price: 10 } as never],
    };
    const payload = formToPayload(form, false);
    expect(payload.has_variants).toBe(false);
    expect(payload.variants).toEqual([]);
  });

  it('still sends the sizes when they are on', () => {
    const form = {
      ...emptyItemForm(1),
      name: 'Tea',
      base_price: '12',
      has_variants: true,
      variants: [{ _key: 'a', id: 5, name: 'Small', price: 10 } as never],
    };
    const payload = formToPayload(form, false);
    expect(payload.variants).toHaveLength(1);
    expect((payload.variants as Array<{ name: string }>)[0].name).toBe('Small');
  });
});
