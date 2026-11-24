import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setViewportWidth } from '../../__tests__/viewport';
import { MenuItemTable } from './MenuItemTable';

/** Owner, 2026-09-03: "in admin, there is no sort option in menu items". */
describe('MenuItemTable sort', () => {
  it('offers the list orders beside the category filter and reports a change', () => {
    setViewportWidth(1280);
    const onSortChange = vi.fn();
    render(
      <MenuItemTable
        categories={[{ id: 1, name: 'Snacks', is_active: true }]}
        items={[]}
        loading={false}
        canManage
        canSeeCost={false}
        menuGroups={[]}
        activeMenuGroupIds={[1]}
        kitchenSaving={false}
        selectedCat={null}
        search=""
        cateringOnly={false}
        sort="price"
        page={1}
        lastPage={1}
        perPage={25}
        onSelectedCatChange={vi.fn()}
        onSearchChange={vi.fn()}
        onCateringOnlyChange={vi.fn()}
        onSortChange={onSortChange}
        onPerPageChange={vi.fn()}
        onPageChange={vi.fn()}
        onToggleKitchenGroup={vi.fn()}
        onSaveKitchenDuty={vi.fn()}
        onToggleAvail={vi.fn()}
        onSnoozeItem={vi.fn()}
        onEditItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onBarcodeLabel={vi.fn()}
        onViewRecipe={vi.fn()}
      />,
    );

    const select = screen.getByTestId('menu-items-sort') as HTMLSelectElement;
    expect(select.value).toBe('price');
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual([
      'Menu order', 'Name A–Z', 'Name Z–A', 'Price: low to high', 'Price: high to low',
      'Category', 'Recently edited', 'Unavailable first',
    ]);

    fireEvent.change(select, { target: { value: 'updated' } });
    expect(onSortChange).toHaveBeenCalledWith('updated');
  });

  /** Owner, 2026-09-03: "when I click Item, it changes from A–Z to Z–A". */
  it('steps a column header from A–Z to Z–A and back to the menu order', () => {
    setViewportWidth(1280);
    const base = {
      categories: [{ id: 1, name: 'Snacks', is_active: true }],
      items: [{ id: 1, name: 'Bajiya', base_price: 10, is_available: true, is_active: true, category_id: 1, category: { id: 1, name: 'Snacks' }, tax_code: 'standard_8', sort_order: 0 } as never],
      loading: false, canManage: true, canSeeCost: false, menuGroups: [], activeMenuGroupIds: [1], kitchenSaving: false,
      selectedCat: null, search: '', cateringOnly: false, page: 1, lastPage: 1, perPage: 25,
      onSelectedCatChange: vi.fn(), onSearchChange: vi.fn(), onCateringOnlyChange: vi.fn(), onPerPageChange: vi.fn(),
      onPageChange: vi.fn(), onToggleKitchenGroup: vi.fn(), onSaveKitchenDuty: vi.fn(), onToggleAvail: vi.fn(),
      onSnoozeItem: vi.fn(), onEditItem: vi.fn(), onDeleteItem: vi.fn(), onBarcodeLabel: vi.fn(), onViewRecipe: vi.fn(),
    };

    const onSortChange = vi.fn();
    const { rerender } = render(<MenuItemTable {...base} sort="menu" onSortChange={onSortChange} />);
    const th = () => screen.getByRole('columnheader', { name: /^Item/ });
    expect(th()).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(screen.getByTestId('sort-th-name'));
    expect(onSortChange).toHaveBeenLastCalledWith('name');

    rerender(<MenuItemTable {...base} sort="name" onSortChange={onSortChange} />);
    expect(th()).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByTestId('sort-th-name'));
    expect(onSortChange).toHaveBeenLastCalledWith('name_desc');

    rerender(<MenuItemTable {...base} sort="name_desc" onSortChange={onSortChange} />);
    expect(th()).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(screen.getByTestId('sort-th-name'));
    expect(onSortChange).toHaveBeenLastCalledWith('menu');

    // A one-direction column goes straight back to the menu order.
    rerender(<MenuItemTable {...base} sort="category" onSortChange={onSortChange} />);
    fireEvent.click(screen.getByTestId('sort-th-category'));
    expect(onSortChange).toHaveBeenLastCalledWith('menu');
  });
  /** Owner, 2026-11-24: how many of each dish sold, on the list, to find the slow ones. */
  it('shows Sold (30 days) and sorts by it when the server sends the figure', () => {
    setViewportWidth(1280);
    const dish = (id: number, name: string, sold?: number) => ({ id, name, base_price: 10, is_available: true, is_active: true, category_id: 1, category: { id: 1, name: 'Snacks' }, tax_code: 'standard_8', sort_order: 0, ...(sold === undefined ? {} : { sold_30d: sold }) } as never);
    const base = {
      categories: [{ id: 1, name: 'Snacks', is_active: true }],
      loading: false, canManage: true, canSeeCost: false, menuGroups: [], activeMenuGroupIds: [1], kitchenSaving: false,
      selectedCat: null, search: '', cateringOnly: false, page: 1, lastPage: 1, perPage: 25,
      onSelectedCatChange: vi.fn(), onSearchChange: vi.fn(), onCateringOnlyChange: vi.fn(), onPerPageChange: vi.fn(),
      onPageChange: vi.fn(), onToggleKitchenGroup: vi.fn(), onSaveKitchenDuty: vi.fn(), onToggleAvail: vi.fn(),
      onSnoozeItem: vi.fn(), onEditItem: vi.fn(), onDeleteItem: vi.fn(), onBarcodeLabel: vi.fn(), onViewRecipe: vi.fn(),
    };
    const onSortChange = vi.fn();

    // Someone without the reports gets no figure: no column, no sort.
    const plain = render(<MenuItemTable {...base} items={[dish(1, 'Bajiya')]} sort="menu" onSortChange={onSortChange} />);
    expect(screen.queryByTestId('sort-th-sold_desc')).toBeNull();
    expect(screen.queryByText('Best selling (30 days)')).toBeNull();
    plain.unmount();

    const { rerender, unmount } = render(<MenuItemTable {...base} items={[dish(1, 'Bajiya', 1240.5), dish(2, 'Water', 0)]} sort="menu" onSortChange={onSortChange} />);
    expect(screen.getByTestId('menu-item-sold-1')).toHaveTextContent('1,240.5');
    expect(screen.getByTestId('menu-item-sold-2')).toHaveTextContent('0');
    expect(screen.getByText('Best selling (30 days)')).toBeInTheDocument();
    expect(screen.getByText('Slowest selling (30 days)')).toBeInTheDocument();

    // The first tap puts the best sellers on top, the second the slow ones.
    fireEvent.click(screen.getByTestId('sort-th-sold_desc'));
    expect(onSortChange).toHaveBeenLastCalledWith('sold_desc');
    rerender(<MenuItemTable {...base} items={[dish(1, 'Bajiya', 1240.5)]} sort="sold_desc" onSortChange={onSortChange} />);
    expect(screen.getByRole('columnheader', { name: /^Sold/ })).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(screen.getByTestId('sort-th-sold_desc'));
    expect(onSortChange).toHaveBeenLastCalledWith('sold');

    // A phone's card says it in words.
    unmount();
    setViewportWidth(390);
    render(<MenuItemTable {...base} items={[dish(1, 'Bajiya', 12), dish(2, 'Water', 0)]} sort="menu" onSortChange={onSortChange} />);
    expect(screen.getByTestId('menu-item-sold-1')).toHaveTextContent('Sold 12 in 30 days');
    expect(screen.getByTestId('menu-item-sold-2')).toHaveTextContent('None sold in 30 days');
  });
});
