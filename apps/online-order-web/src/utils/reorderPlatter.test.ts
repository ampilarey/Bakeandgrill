import { describe, expect, it } from 'vitest';
import { applyReorderLines } from './reorderPlatter';

describe('applyReorderLines', () => {
  it('replays platter children into structured selections', () => {
    const result = applyReorderLines([
      {
        item_id: 100,
        item_name: 'Hedhikaa Platter',
        quantity: 1,
        unit_price: 120,
        is_platter: true,
        children: [
          { item_id: 1, item_name: 'Bajiya', quantity: 3, surcharge: 0 },
          { item_id: 2, item_name: 'Gulha', quantity: 3, surcharge: 5 },
        ],
        modifiers: [],
      },
    ]);
    expect(result.needsPicker).toHaveLength(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].platterSelections).toEqual([
      expect.objectContaining({ item_id: 1, quantity: 3, surcharge: 0 }),
      expect.objectContaining({ item_id: 2, quantity: 3, surcharge: 5 }),
    ]);
  });

  it('never silently adds an empty platter — opens picker instead', () => {
    const result = applyReorderLines([
      {
        item_id: 100,
        item_name: 'Hedhikaa Platter',
        quantity: 1,
        unit_price: 120,
        is_platter: true,
        children: [],
        modifiers: [],
      },
      {
        item_id: 50,
        item_name: 'Tea',
        quantity: 2,
        unit_price: 10,
        is_platter: false,
        modifiers: [],
      },
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].item_id).toBe(50);
    expect(result.needsPicker).toEqual([
      expect.objectContaining({ item_id: 100, item_name: 'Hedhikaa Platter' }),
    ]);
  });
});
