import { describe, expect, it, vi } from 'vitest';

let origin = 'https://bakeandgrill.mv';
vi.mock('../api', () => ({ get API_ORIGIN() { return origin; } }));

describe('categoryShareUrl', () => {
  it('links to the category page by slug, falling back to the id', async () => {
    const { categoryShareUrl, categoryShareProps } = await import('./categoryShare');
    expect(categoryShareUrl({ id: 3, name: 'Hot Drinks', slug: 'hot-drinks' })).toBe('https://bakeandgrill.mv/menu/c/hot-drinks');
    expect(categoryShareUrl({ id: 3, name: 'Hot Drinks', slug: null })).toBe('https://bakeandgrill.mv/menu/c/3');
    expect(categoryShareUrl({ id: 3, name: 'Hot Drinks', slug: '' })).toBe('https://bakeandgrill.mv/menu/c/3');
    expect(categoryShareProps({ id: 3, name: 'Hot Drinks', slug: 'hot-drinks' }).ariaLabel).toBe('Share Hot Drinks');
  });

  it('uses the page origin when the app is served from the same site as the API', async () => {
    const { categoryShareUrl } = await import('./categoryShare');
    origin = '';
    expect(categoryShareUrl({ id: 3, name: 'Hot Drinks', slug: 'hot-drinks' })).toBe(`${window.location.origin}/menu/c/hot-drinks`);
    origin = 'https://bakeandgrill.mv/';
    expect(categoryShareUrl({ id: 3, name: 'Hot Drinks', slug: 'hot-drinks' })).toBe('https://bakeandgrill.mv/menu/c/hot-drinks');
  });
});
