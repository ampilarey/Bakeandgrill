import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../../api';
import { setViewportWidth } from '../../__tests__/viewport';
import { MenuItemTable } from './MenuItemTable';

/**
 * The item list on /admin/menu. Owner, 2026-09-02: "enhance the layout of
 * the desktop and mobile view". Phones used to get a seven-column table that
 * scrolled sideways under a full-height "Chef menu on duty" card; they now get
 * cards, and the table keeps to desktop.
 */

function item(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    name: 'Bajiya',
    base_price: 10,
    is_available: true,
    is_active: true,
    category_id: 1,
    category: { id: 1, name: 'Snacks' },
    tax_code: 'standard_8',
    sort_order: 0,
    ...over,
  } as MenuItem;
}

const categories = [
  { id: 1, name: 'Snacks', is_active: true },
  { id: 2, name: 'Grill', is_active: true },
  { id: 3, name: 'Kebabs', is_active: true, parent_id: 2 },
];

function renderTable(over: Partial<Parameters<typeof MenuItemTable>[0]> = {}) {
  const handlers = {
    onSelectedCatChange: vi.fn(),
    onSearchChange: vi.fn(),
    onCateringOnlyChange: vi.fn(),
    onSortChange: vi.fn(),
    onPerPageChange: vi.fn(),
    onPageChange: vi.fn(),
    onToggleKitchenGroup: vi.fn(),
    onSaveKitchenDuty: vi.fn(),
    onToggleAvail: vi.fn(),
    onSnoozeItem: vi.fn(),
    onEditItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onBarcodeLabel: vi.fn(),
    onViewRecipe: vi.fn(),
  };
  render(
    <MenuItemTable
      categories={categories}
      items={[
        item({ id: 1, name: 'Bajiya', sku: 'BJ-1' }),
        item({ id: 2, name: 'Kebab', category_id: 3, category: { id: 3, name: 'Kebabs' }, base_price: 45, is_available: false }),
      ]}
      loading={false}
      canManage
      canSeeCost
      menuGroups={[
        { id: 1, name: 'Evening', slug: 'evening', sort_order: 0, is_active: true },
        { id: 2, name: 'Ramadan', slug: 'ramadan', sort_order: 1, is_active: true },
      ]}
      activeMenuGroupIds={[1]}
      kitchenSaving={false}
      selectedCat={null}
      search=""
      cateringOnly={false}
      sort="menu"
      page={1}
      lastPage={1}
      perPage={25}
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

beforeEach(() => setViewportWidth(1280));
afterEach(() => setViewportWidth(1280));

describe('MenuItemTable on desktop', () => {
  it('renders the items as a table with the quick-edit column names', () => {
    renderTable();

    const table = screen.getByTestId('menu-item-table');
    expect(screen.queryByTestId('menu-item-cards')).not.toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Selling today' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'On menu' })).toBeInTheDocument();
    expect(within(table).getByText('MVR 45.00')).toBeInTheDocument();
    expect(within(table).getByText('BJ-1')).toBeInTheDocument();
  });

  it('shows a sub-category under its parent', () => {
    renderTable();

    const row = screen.getByTestId('menu-item-row-2');
    expect(row).toHaveTextContent('Grill › Kebabs');
  });

  it('labels every action so it is not an emoji guess', () => {
    const h = renderTable();

    const row = screen.getByTestId('menu-item-row-1');
    fireEvent.click(within(row).getByRole('button', { name: 'Print barcode label for Bajiya' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Recipe and cost for Bajiya' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Edit Bajiya' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Delete Bajiya' }));

    expect(h.onBarcodeLabel).toHaveBeenCalledWith(1);
    expect(h.onViewRecipe).toHaveBeenCalledWith(1);
    expect(h.onEditItem).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(h.onDeleteItem).toHaveBeenCalledWith(1);
  });

  it('exposes the availability toggle as a switch', () => {
    const h = renderTable();

    const sw = screen.getByRole('switch', { name: 'Kebab: selling today' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(h.onToggleAvail).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('hides the recipe button from staff who cannot see cost', () => {
    renderTable({ canSeeCost: false });

    expect(screen.queryByRole('button', { name: /Recipe and cost/ })).not.toBeInTheDocument();
  });
});

describe('MenuItemTable on a phone', () => {
  beforeEach(() => setViewportWidth(390));

  it('renders cards instead of a sideways-scrolling table', () => {
    renderTable();

    expect(screen.queryByTestId('menu-item-table')).not.toBeInTheDocument();
    const cards = screen.getByTestId('menu-item-cards');
    expect(within(cards).getAllByTestId(/^menu-item-card-/)).toHaveLength(2);

    const kebab = screen.getByTestId('menu-item-card-2');
    expect(kebab).toHaveTextContent('Kebab');
    expect(kebab).toHaveTextContent('MVR 45.00');
    expect(kebab).toHaveTextContent('Grill › Kebabs');
    expect(within(kebab).getByRole('switch', { name: 'Kebab: selling today' })).toBeInTheDocument();
    expect(within(kebab).getByRole('button', { name: 'Edit Kebab' })).toBeInTheDocument();
  });
});

describe('MenuItemTable chrome', () => {
  it('keeps the chef menu on duty to one compact bar with the groups as chips', () => {
    const h = renderTable();

    const bar = screen.getByTestId('menu-duty');
    const group = within(bar).getByRole('group', { name: 'Menu groups on duty' });
    expect(within(group).getByLabelText('Evening')).toBeChecked();
    expect(within(group).getByLabelText('Ramadan')).not.toBeChecked();

    fireEvent.click(within(group).getByLabelText('Ramadan'));
    expect(h.onToggleKitchenGroup).toHaveBeenCalledWith(2);

    fireEvent.click(within(bar).getByRole('button', { name: 'Save active menus' }));
    expect(h.onSaveKitchenDuty).toHaveBeenCalled();
  });

  it('puts search, category and the catering filter in one toolbar', () => {
    const h = renderTable();

    const toolbar = screen.getByTestId('menu-items-toolbar');
    fireEvent.change(within(toolbar).getByRole('searchbox', { name: 'Search items' }), { target: { value: 'baj' } });
    expect(h.onSearchChange).toHaveBeenCalledWith('baj');

    fireEvent.change(within(toolbar).getByRole('combobox', { name: 'Category' }), { target: { value: '3' } });
    expect(h.onSelectedCatChange).toHaveBeenCalledWith(3);

    fireEvent.click(within(toolbar).getByLabelText('Catering only'));
    expect(h.onCateringOnlyChange).toHaveBeenCalledWith(true);
  });

  it('moves the per-page choice down to the footer with the count', () => {
    const h = renderTable({ lastPage: 3, page: 2 });

    const toolbar = screen.getByTestId('menu-items-toolbar');
    expect(within(toolbar).queryByLabelText('Items per page')).not.toBeInTheDocument();

    const footer = screen.getByTestId('menu-items-footer');
    expect(footer).toHaveTextContent('2 items · page 2 of 3');

    fireEvent.change(within(footer).getByLabelText('Items per page'), { target: { value: '50' } });
    expect(h.onPerPageChange).toHaveBeenCalledWith(50);

    fireEvent.click(within(footer).getByRole('button', { name: 'Next →' }));
    expect(h.onPageChange).toHaveBeenCalledWith(3);
  });

  it('hides the pager on a single page but keeps the count', () => {
    renderTable();

    const footer = screen.getByTestId('menu-items-footer');
    expect(footer).toHaveTextContent('2 items');
    expect(within(footer).queryByRole('button', { name: 'Next →' })).not.toBeInTheDocument();
  });

  it('filters to catering items client-side when asked', () => {
    renderTable({ cateringOnly: true });

    expect(screen.getByText('No catering-flagged items on this page.')).toBeInTheDocument();
  });
});
