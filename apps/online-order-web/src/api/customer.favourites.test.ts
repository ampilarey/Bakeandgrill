import { describe, expect, it } from 'vitest';
import { normalizeFavouritesResponse } from './customer';

describe('normalizeFavouritesResponse', () => {
  it('reads the backend favorites key (not data)', () => {
    const result = normalizeFavouritesResponse({
      favorites: [
        {
          id: 7,
          name: 'Chicken Burger',
          base_price: '85.00',
          image_url: '/img/burger.jpg',
          category: { id: 2, name: 'Grill' },
          is_active: true,
        },
      ],
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      id: 7,
      name: 'Chicken Burger',
      base_price: 85,
      image_url: '/img/burger.jpg',
      category: 'Grill',
      is_available: true,
    });
  });

  it('falls back to empty list when envelope is missing', () => {
    expect(normalizeFavouritesResponse({}).data).toEqual([]);
  });

  it('still accepts a legacy data envelope', () => {
    const result = normalizeFavouritesResponse({
      data: [{ id: 1, name: 'Tea', base_price: 10, category: 'Drinks', is_available: false }],
    });
    expect(result.data[0]?.category).toBe('Drinks');
    expect(result.data[0]?.is_available).toBe(false);
  });
});
