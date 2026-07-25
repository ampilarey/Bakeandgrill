import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import SpecialsPage from '../pages/SpecialsPage';
import { renderWithRouter } from './testUtils';
import { ToastProvider } from '../components/ui';
import {
  fetchSpecials,
  getSpecial,
  createSpecial,
  updateSpecial,
  findOverlappingSpecial,
  fetchAdminCategories,
  fetchAdminItems,
} from '../api';

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
  ItemSearch: ({
    value,
    onChange,
  }: {
    value: { id: number; label: string; item: { id: number; name: string; base_price: number; has_variants?: boolean } } | null;
    onChange: (v: { id: number; label: string; item: { id: number; name: string; base_price: number; has_variants?: boolean } } | null) => void;
  }) => (
    <div data-testid="item-search">
      {value ? (
        <button type="button" onClick={() => onChange(null)}>Clear {value.label}</button>
      ) : (
        <button
          type="button"
          onClick={() => onChange({
            id: 11,
            label: 'Chicken Grill',
            item: { id: 11, name: 'Chicken Grill', base_price: 50, has_variants: false },
          })}
        >
          Pick Chicken Grill
        </button>
      )}
    </div>
  ),
}));

const specialRow = {
  id: 7,
  item_id: 11,
  item_name: 'Chicken Grill',
  item_image: null,
  badge_label: "Chef's Special",
  special_price: 39,
  discount_pct: 22,
  original_price: 50,
  effective_price: 39,
  start_date: '2026-07-25',
  end_date: '2026-07-25',
  start_time: null,
  end_time: null,
  days_of_week: null,
  max_quantity: null,
  description: null,
  is_active: true,
  sold_count: 2,
  variant_overrides: [],
};

function renderPage() {
  return renderWithRouter(
    <ToastProvider>
      <SpecialsPage />
    </ToastProvider>,
  );
}

describe('SpecialsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSpecials).mockResolvedValue({
      data: [specialRow],
      meta: { current_page: 1, last_page: 1, total: 1, active_today_count: 1 },
    } as never);
    vi.mocked(findOverlappingSpecial).mockResolvedValue(null as never);
    vi.mocked(fetchAdminCategories).mockResolvedValue({ data: [] } as never);
    vi.mocked(fetchAdminItems).mockResolvedValue({ data: [] } as never);
  });

  it('renders mobile card markup alongside the desktop table', async () => {
    renderPage();
    expect((await screen.findAllByText('Chicken Grill')).length).toBeGreaterThan(0);
    expect(document.querySelector('.specials-mobile-list')).toBeTruthy();
    expect(document.querySelector('.specials-mobile-card')).toBeTruthy();
    expect(document.querySelector('.specials-desktop-table')).toBeTruthy();
  });

  it('shows a validation error in the body and sticky footer without saving', async () => {
    renderPage();
    await screen.findAllByText('Chicken Grill');

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Discount/i }));
    expect(await screen.findByRole('heading', { name: /Add Daily Special/i })).toBeTruthy();
    expect(screen.getByTestId('modal-footer')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    expect(await screen.findByTestId('specials-form-error')).toHaveTextContent('Select a menu item.');
    expect(screen.getByTestId('specials-footer-error')).toHaveTextContent('Select a menu item.');
    expect(createSpecial).not.toHaveBeenCalled();
    expect(updateSpecial).not.toHaveBeenCalled();
  });

  it('persists an edit and re-renders updated values', async () => {
    const updated = {
      ...specialRow,
      special_price: 29,
      discount_pct: 42,
      effective_price: 29,
      badge_label: 'Lunch Deal',
      is_active: true,
    };

    vi.mocked(getSpecial).mockResolvedValue({
      special: {
        ...specialRow,
        variant_overrides: [],
      },
    } as never);

    vi.mocked(updateSpecial).mockResolvedValue({ special: updated } as never);

    vi.mocked(fetchSpecials)
      .mockResolvedValueOnce({
        data: [specialRow],
        meta: { current_page: 1, last_page: 1, total: 1, active_today_count: 1 },
      } as never)
      .mockResolvedValueOnce({
        data: [updated],
        meta: { current_page: 1, last_page: 1, total: 1, active_today_count: 1 },
      } as never);

    renderPage();
    await screen.findAllByText('Chicken Grill');

    fireEvent.click(screen.getAllByLabelText('Edit special')[0]);

    expect(await screen.findByRole('heading', { name: /Edit Daily Special/i })).toBeTruthy();

    const priceInput = screen.getByPlaceholderText('e.g. 39.00') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '29' } });

    const badgeInput = screen.getByPlaceholderText("e.g. Chef's Special");
    fireEvent.change(badgeInput, { target: { value: 'Lunch Deal' } });

    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));

    await waitFor(() => {
      expect(updateSpecial).toHaveBeenCalledWith(7, expect.objectContaining({
        item_id: 11,
        badge_label: 'Lunch Deal',
        is_active: true,
        discount_pct: 42,
      }));
    });

    await waitFor(() => {
      expect(screen.getAllByText('Lunch Deal').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/MVR 29\.00/).length).toBeGreaterThan(0);
    });

    expect(await screen.findByText('Discount updated.')).toBeTruthy();
  });

  it('sends null badge_label when the custom badge is cleared on edit', async () => {
    const cleared = { ...specialRow, badge_label: null };

    vi.mocked(getSpecial).mockResolvedValue({
      special: { ...specialRow, variant_overrides: [] },
    } as never);
    vi.mocked(updateSpecial).mockResolvedValue({ special: cleared } as never);
    vi.mocked(fetchSpecials)
      .mockResolvedValueOnce({
        data: [specialRow],
        meta: { current_page: 1, last_page: 1, total: 1, active_today_count: 1 },
      } as never)
      .mockResolvedValueOnce({
        data: [cleared],
        meta: { current_page: 1, last_page: 1, total: 1, active_today_count: 1 },
      } as never);

    renderPage();
    await screen.findAllByText('Chicken Grill');
    fireEvent.click(screen.getAllByLabelText('Edit special')[0]);
    expect(await screen.findByRole('heading', { name: /Edit Daily Special/i })).toBeTruthy();

    const badgeInput = screen.getByPlaceholderText("e.g. Chef's Special") as HTMLInputElement;
    expect(badgeInput.value).toBe("Chef's Special");
    fireEvent.change(badgeInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));

    await waitFor(() => {
      expect(updateSpecial).toHaveBeenCalledWith(7, expect.objectContaining({
        badge_label: null,
      }));
    });

    // List shows no custom badge once cleared (Type column still describes the discount).
    await waitFor(() => {
      expect(screen.queryByText("Chef's Special")).toBeNull();
      expect(screen.queryByText('22% OFF')).toBeNull();
    });
  });

  it('surfaces API error messages verbatim and does not close the modal', async () => {
    vi.mocked(getSpecial).mockResolvedValue({ special: { ...specialRow, variant_overrides: [] } } as never);
    vi.mocked(updateSpecial).mockRejectedValue(new Error('End date must be on or after start date.'));

    renderPage();
    await screen.findAllByText('Chicken Grill');
    fireEvent.click(screen.getAllByLabelText('Edit special')[0]);
    await screen.findByRole('heading', { name: /Edit Daily Special/i });

    fireEvent.click(screen.getByRole('button', { name: /^Update$/i }));

    expect(await screen.findByTestId('specials-form-error')).toHaveTextContent('End date must be on or after start date.');
    expect(screen.getByTestId('specials-footer-error')).toHaveTextContent('End date must be on or after start date.');
    expect(screen.getByRole('heading', { name: /Edit Daily Special/i })).toBeTruthy();
  });

  it('keeps create validation from silently failing when pricing is empty', async () => {
    renderPage();
    await screen.findAllByText('Chicken Grill');
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Discount/i }));
    fireEvent.click(within(await screen.findByTestId('item-search')).getByText(/Pick Chicken Grill/i));
    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    expect(await screen.findByTestId('specials-footer-error')).toHaveTextContent(
      'Enter an item-level discount, or set pricing on at least one variant.',
    );
    expect(createSpecial).not.toHaveBeenCalled();
  });
});
