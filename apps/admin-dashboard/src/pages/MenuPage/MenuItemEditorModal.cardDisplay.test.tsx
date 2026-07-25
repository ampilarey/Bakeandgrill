import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuItemEditorModal } from './MenuItemEditorModal';
import { emptyItemForm } from './menuItemForm';

vi.mock('../../hooks/useGstBootstrap', () => ({
  useGstBootstrap: () => ({
    loading: false,
    codes: [],
    defaultCode: 'standard_8',
  }),
}));

describe('MenuItemEditorModal menu card display', () => {
  it('renders card display section and live preview updates as you type', () => {
    const initial = emptyItemForm(1);
    initial.name = 'Chicken Grill Platter';
    initial.base_price = '85';
    initial.description = 'A long fallback description for the little detail line.';

    render(
      <MenuItemEditorModal
        title="Edit item"
        initial={initial}
        categories={[{ id: 1, name: 'Grill', is_active: true, sort_order: 0 }]}
        menuGroups={[{ id: 1, name: 'Default', slug: 'default', is_active: true, sort_order: 0 }]}
        onSave={async () => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('menu-card-display-section')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-live-preview')).toBeInTheDocument();
    expect(screen.getByTestId('menu-card-preview-name')).toHaveTextContent('Chicken Grill Platter');
    expect(screen.getByTestId('menu-card-preview-detail').textContent).toMatch(/long fallback/i);
    expect(screen.getByTestId('menu-card-preview-price')).toHaveTextContent('MVR 85.00');

    const cardName = screen.getByPlaceholderText('Chicken Grill Platter');
    fireEvent.change(cardName, { target: { value: 'Short Grill' } });
    expect(screen.getByTestId('menu-card-preview-name')).toHaveTextContent('Short Grill');

    const shortDesc = screen.getByPlaceholderText('Little detail line on the mobile menu card');
    fireEvent.change(shortDesc, { target: { value: 'Smoky' } });
    expect(screen.getByTestId('menu-card-preview-detail')).toHaveTextContent('Smoky');

    const priceNote = screen.getByPlaceholderText(/from/);
    fireEvent.change(priceNote, { target: { value: 'from' } });
    expect(screen.getByTestId('menu-card-preview-price').textContent).toMatch(/from/);
  });
});
