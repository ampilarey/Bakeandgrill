import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuItemEditorModal } from './MenuItemEditorModal';
import { emptyItemForm } from './menuItemForm';

vi.mock('../../hooks/useGstBootstrap', () => ({ useGstBootstrap: () => null }));

/**
 * Owner, 2026-09-02: "did u do the same for new item adding box". The
 * editor is now sections with a jump bar and Save in the dialog footer.
 * jsdom applies no CSS, so these pin the structure: the order of sections,
 * that the chips reach them, and that Save and its error live in the footer.
 */
function renderEditor(over: Partial<Parameters<typeof MenuItemEditorModal>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <MenuItemEditorModal
      initial={emptyItemForm(1)}
      title="New Menu Item"
      categories={[{ id: 1, name: 'Snacks', is_active: true }]}
      menuGroups={[{ id: 1, name: 'Evening', slug: 'evening', sort_order: 0, is_active: true }]}
      onSave={onSave}
      onClose={() => {}}
      {...over}
    />,
  );
  return { onSave };
}

describe('MenuItemEditorModal layout', () => {
  it('opens with the basics first: name, category, menu group, code', () => {
    renderEditor();

    const basics = screen.getByTestId('mie-section-basics');
    expect(within(basics).getByPlaceholderText('e.g. Chicken Grill')).toBeInTheDocument();
    expect(within(basics).getByText('Category')).toBeInTheDocument();
    expect(within(basics).getByText('Menu group (chef / station)')).toBeInTheDocument();
    expect(within(basics).getByPlaceholderText('e.g. CHKGRL-01')).toBeInTheDocument();

    const sections = screen.getAllByTestId(/^(mie-section-|menu-card-display-section|bundle-platter-section)/);
    expect(sections[0]).toHaveAttribute('data-testid', 'mie-section-basics');
    expect(sections[1]).toHaveAttribute('data-testid', 'mie-section-pricing');
  });

  it('offers a chip for every section, and drops Stock once the dish has sizes', () => {
    renderEditor();

    const nav = screen.getByTestId('mie-nav');
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Basics', 'Price & sizes', 'Menu card', 'Details', 'Where sold', 'Photo', 'Stock', 'Packaging', 'Add-ons', 'Bundle', 'TV board',
    ]);

    fireEvent.click(screen.getByLabelText(/This product has variants/));

    expect(within(nav).queryByRole('button', { name: 'Stock' })).toBeNull();
    expect(screen.queryByTestId('mie-section-stock')).toBeNull();
  });

  it('scrolls to the section a chip names', () => {
    renderEditor();
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function () { scrolled.push(this); };

    fireEvent.click(within(screen.getByTestId('mie-nav')).getByRole('button', { name: 'Packaging' }));

    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]).toBe(screen.getByTestId('mie-section-packaging'));
  });

  it('keeps Save in the dialog footer and puts a validation message beside it', async () => {
    const { onSave } = renderEditor();

    const footer = screen.getByTestId('mie-footer');
    fireEvent.click(within(footer).getByRole('button', { name: 'Save Item' }));

    expect(await within(footer).findByText('Item name is required.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('still saves a filled-in item from the footer', async () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByPlaceholderText('e.g. Chicken Grill'), { target: { value: 'Bajiya' } });
    const pricing = screen.getByTestId('mie-section-pricing');
    fireEvent.change(within(pricing).getByPlaceholderText('0.00'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Bajiya', base_price: '5' });
  });
});
