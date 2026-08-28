import { publicMenuItemUrl } from './publicMenuItemUrl';

vi.mock('../api', () => ({
  API_ORIGIN: 'https://bakeandgrill.mv',
}));

describe('publicMenuItemUrl', () => {
  it('builds the canonical Blade item URL, never an order-app path', () => {
    expect(publicMenuItemUrl(42)).toBe('https://bakeandgrill.mv/menu/42');
    expect(publicMenuItemUrl(42)).not.toContain('/order/');
  });
});
