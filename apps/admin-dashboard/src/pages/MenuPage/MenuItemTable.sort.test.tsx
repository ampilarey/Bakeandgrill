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
});
