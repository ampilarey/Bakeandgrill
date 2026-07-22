import { render, screen } from '@testing-library/react';
import { MenuSectionHeader } from './MenuSectionHeader';
import type { Category } from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    API_ORIGIN: 'https://example.test',
  };
});

const baseCat: Category = {
  id: 7,
  name: 'Grill Favourites',
  description: 'Charcoal hits and house sauces.',
  image_url: '/storage/categories/grill.jpg',
  parent_id: null,
  sort_order: 1,
};

describe('MenuSectionHeader (ZUS-style)', () => {
  it('renders promo banner image, overlay title, and accent title row', () => {
    const { container } = render(<MenuSectionHeader category={baseCat} active />);

    expect(container.querySelector('.menu-section-header')).toHaveClass('is-active');
    expect(container.querySelector('.menu-cat-promo')).toBeTruthy();
    const img = container.querySelector('.menu-cat-promo__img') as HTMLImageElement | null;
    expect(img?.src).toContain('/storage/categories/grill.jpg');
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getAllByText('Grill Favourites').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Charcoal hits and house sauces.')).toBeInTheDocument();
    expect(container.querySelector('.menu-cat-title__bar')).toBeTruthy();
  });

  it('falls back to gradient promo when category has no image', () => {
    const { container } = render(
      <MenuSectionHeader
        category={{ ...baseCat, image_url: null, description: null }}
      />,
    );
    expect(container.querySelector('.menu-cat-promo__img')).toBeNull();
    const promo = container.querySelector('.menu-cat-promo') as HTMLElement;
    expect(promo.getAttribute('style') ?? '').toContain('linear-gradient');
    expect(screen.getAllByText('Grill Favourites').length).toBeGreaterThanOrEqual(1);
  });
});
