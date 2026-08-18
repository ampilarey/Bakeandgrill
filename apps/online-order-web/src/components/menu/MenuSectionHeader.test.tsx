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

describe('MenuSectionHeader', () => {
  it('renders the promo strip with the category name on it', () => {
    const { container } = render(<MenuSectionHeader category={baseCat} active />);

    expect(container.querySelector('.menu-section-header')).toHaveClass('is-active');
    expect(container.querySelector('.menu-cat-promo')).toBeTruthy();
    const img = container.querySelector('.menu-cat-promo__img') as HTMLImageElement | null;
    expect(img?.src).toContain('/storage/categories/grill.jpg');
    expect(screen.getByText('Category')).toBeInTheDocument();
    // Description remains in DOM; thin-strip CSS hides it visually
    expect(screen.getByText('Charcoal hits and house sauces.')).toBeInTheDocument();
  });

  /**
   * The reported fault. Owner, 2026-08-18, on a screenshot of the live menu:
   * "main category name is in the banner and below the photo also … name in
   * the banner is enough." The strip printed the name, then an accent-barred
   * <h2> printed it again a few pixels lower.
   */
  it('names the category exactly once', () => {
    render(<MenuSectionHeader category={baseCat} />);

    expect(screen.getAllByText('Grill Favourites')).toHaveLength(1);
  });

  it('makes that one name the section heading, so sub-category h3s have a parent', () => {
    // Not decoration: MenuPage renders each sub-category title as an <h3>
    // beneath this, and the outline has to hold together.
    render(<MenuSectionHeader category={baseCat} />);

    const heading = screen.getByRole('heading', { level: 2, name: 'Grill Favourites' });
    expect(heading).toHaveClass('menu-cat-promo__title');
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
  });

  it('still announces an image-less category to a screen reader', () => {
    // The strip used to be aria-hidden whenever it had no photo — safe while a
    // second <h2> carried the name, silent the moment that <h2> went away.
    render(
      <MenuSectionHeader category={{ ...baseCat, image_url: null, description: null }} />,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Grill Favourites' })).toBeVisible();
  });
});
