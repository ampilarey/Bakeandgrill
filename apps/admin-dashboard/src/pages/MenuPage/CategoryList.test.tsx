import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MenuCategory } from '../../api';
import { CategoryList } from './CategoryList';

/**
 * The Categories tab on /admin/menu, redone alongside the Items tab.
 * Owner, 2026-09-02: "do the same for the categories tab".
 */

const categories: MenuCategory[] = [
  { id: 1, name: 'Grill', name_dv: 'ގްރިލް', description: 'Off the coals', is_active: true, sort_order: 1, items: [{ id: 10 }, { id: 11 }] as MenuCategory['items'] },
  { id: 2, name: 'Kebabs', is_active: true, sort_order: 1, parent_id: 1, items: [] },
  { id: 3, name: 'Drinks', is_active: false, sort_order: 2, items: [{ id: 12 }] as MenuCategory['items'] },
];

function renderList(over: Partial<Parameters<typeof CategoryList>[0]> = {}) {
  const h = {
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onViewItems: vi.fn(),
  };
  render(<CategoryList categories={categories} canManage {...h} {...over} />);
  return h;
}

describe('CategoryList', () => {
  it('nests sub-categories inside their parent card', () => {
    renderList();

    const grill = screen.getByTestId('menu-cat-card-1');
    expect(within(grill).getByTestId('menu-cat-2')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-cat-card-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-cat-card-3')).toBeInTheDocument();
  });

  it('summarises the list and each category', () => {
    renderList();

    expect(screen.getByTestId('menu-cat-list')).toHaveTextContent('3 categories · 1 hidden from customers');
    expect(screen.getByTestId('menu-cat-1')).toHaveTextContent('2 items · 1 sub-category · Sort 1');
    expect(screen.getByTestId('menu-cat-1')).toHaveTextContent('ގްރިލް');
    expect(screen.getByTestId('menu-cat-1')).toHaveTextContent('Off the coals');
    expect(within(screen.getByTestId('menu-cat-3')).getByText('Hidden')).toBeInTheDocument();
  });

  it('gives every action an accessible name', () => {
    const h = renderList();

    const drinks = screen.getByTestId('menu-cat-3');
    fireEvent.click(within(drinks).getByRole('button', { name: 'Show Drinks' }));
    fireEvent.click(within(drinks).getByRole('button', { name: 'Edit Drinks' }));
    fireEvent.click(within(drinks).getByRole('button', { name: 'Delete Drinks' }));
    fireEvent.click(within(drinks).getByRole('button', { name: 'Show items in Drinks' }));

    expect(h.onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(h.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    expect(h.onDelete).toHaveBeenCalledWith(3);
    expect(h.onViewItems).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it('leaves only the items shortcut for staff who cannot manage the menu', () => {
    renderList({ canManage: false });

    const grill = screen.getByTestId('menu-cat-1');
    expect(within(grill).getByRole('button', { name: 'Show items in Grill' })).toBeInTheDocument();
    expect(within(grill).queryByRole('button', { name: /Edit|Delete|Hide/ })).not.toBeInTheDocument();
  });

  it('shows an initial where a category has no banner', () => {
    renderList();

    const grill = screen.getByTestId('menu-cat-1');
    expect(grill.querySelector('.menu-cat-thumb-empty')).toHaveTextContent('G');
  });
});
