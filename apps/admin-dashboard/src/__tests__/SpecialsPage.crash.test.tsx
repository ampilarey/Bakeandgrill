import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import SpecialsPage from '../pages/SpecialsPage';
import { renderWithRouter } from './testUtils';
import { ToastProvider } from '../components/ui';
import { fetchSpecials, findOverlappingSpecial, fetchAdminCategories, fetchAdminItems } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchSpecials: vi.fn(),
    getSpecial: vi.fn(),
    createSpecial: vi.fn(),
    updateSpecial: vi.fn(),
    deleteSpecial: vi.fn(),
    findOverlappingSpecial: vi.fn(),
    fetchAdminCategories: vi.fn(),
    fetchAdminItems: vi.fn(),
    fetchItemVariants: vi.fn().mockResolvedValue({ variants: [] }),
  };
});

vi.mock('../components/ItemSearch', () => ({
  ItemSearch: () => <div data-testid="item-search" />,
}));

describe('SpecialsPage decimal-string payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findOverlappingSpecial).mockResolvedValue(null as never);
    vi.mocked(fetchAdminCategories).mockResolvedValue({ data: [] } as never);
    vi.mocked(fetchAdminItems).mockResolvedValue({ data: [] } as never);
  });

  it('renders when Laravel decimal casts arrive as strings (no ErrorBoundary crash)', async () => {
    vi.mocked(fetchSpecials).mockResolvedValue({
      data: [{
        id: 6,
        item_id: 60,
        item_name: 'BML Bajiya',
        item_image: '/x.jpg',
        badge_label: '50% OFF',
        special_price: null,
        discount_pct: 50,
        original_price: '1.00' as unknown as number,
        effective_price: '0.50' as unknown as number,
        start_date: '2026-07-25',
        end_date: '2026-07-26',
        start_time: null,
        end_time: null,
        days_of_week: null,
        max_quantity: null,
        description: null,
        is_active: true,
        sold_count: 3,
        variant_overrides: [],
      }, {
        id: 5,
        item_id: 62,
        item_name: 'water',
        item_image: null,
        badge_label: 'Special Offer',
        special_price: '8.50' as unknown as number,
        discount_pct: null,
        original_price: '0.00' as unknown as number,
        effective_price: '0.00' as unknown as number,
        start_date: '2026-05-22',
        end_date: '2027-05-29',
        start_time: null,
        end_time: null,
        days_of_week: [0, 1, 2],
        max_quantity: null,
        description: null,
        is_active: true,
        sold_count: 0,
        variant_overrides: [
          {
            variant_id: 1,
            variant_name: 'Large',
            catalog_price: '10.00' as unknown as number,
            discount_pct: 78,
            special_price: null,
            effective_price: '2.20' as unknown as number,
          },
        ],
      }],
      meta: { current_page: 1, last_page: 1, total: 2, active_today_count: 2 },
    } as never);

    renderWithRouter(
      <ToastProvider>
        <SpecialsPage />
      </ToastProvider>,
    );

    expect((await screen.findAllByText('BML Bajiya')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MVR 0\.50/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('water').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/78% off/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MVR 2\.20/).length).toBeGreaterThan(0);
  });
});
