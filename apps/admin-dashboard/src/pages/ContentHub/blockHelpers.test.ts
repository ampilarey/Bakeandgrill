import { describe, expect, it } from 'vitest';
import { helperForBlock } from './blockHelpers';
import type { ContentBlock } from '../../api/content';

function block(key: string, description: string | null = null): ContentBlock {
  return {
    key,
    label: key,
    group: 'Order App',
    type: 'text',
    apps: ['order_app'],
    shareable: false,
    public: true,
    description,
    default: null,
    shared: null,
    website: null,
    order_app: null,
    resolved_website: null,
    resolved_order_app: null,
    state: 'shared',
  };
}

describe('Content Hub mode-card helpers', () => {
  it('registers order_mode_dine_in_hint with a plain-language description', () => {
    const sentence = helperForBlock(block('order_mode_dine_in_hint'));
    expect(sentence).toBe('Hint under the Eat here mode card.');
  });

  it('registers info-sheet and status helpers for all three modes', () => {
    expect(helperForBlock(block('order_mode_delivery_info'))).toMatch(/Delivery/i);
    expect(helperForBlock(block('order_mode_pickup_info'))).toMatch(/Pickup/i);
    expect(helperForBlock(block('order_mode_dine_in_info'))).toMatch(/Eat here/i);
    expect(helperForBlock(block('order_mode_status_unavailable_opens'))).toMatch(/\{time\}/);
    expect(helperForBlock(block('order_mode_learn_more'))).toMatch(/closed mode card/i);
  });

  it('prefers registry description over KEY_HELPERS when present', () => {
    expect(helperForBlock(block('order_mode_dine_in_hint', 'From registry'))).toBe('From registry');
  });

  it('registers mode card photo helpers', () => {
    expect(helperForBlock(block('order_mode_delivery_image'))).toMatch(/Website vs Order App/i);
    expect(helperForBlock(block('order_mode_pickup_image'))).toMatch(/Pickup/i);
    expect(helperForBlock(block('order_mode_dine_in_image'))).toMatch(/Eat here/i);
  });
});
