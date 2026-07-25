import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuQuickFilters } from './MenuQuickFilters';

describe('MenuQuickFilters', () => {
  it('renders deal and top-seller chips next to layout controls', () => {
    const onChange = vi.fn();
    render(
      <MenuQuickFilters
        saleFilter="all"
        onChange={onChange}
        discountCount={2}
        specialCount={1}
        bestsellerCount={4}
      />,
    );

    expect(screen.getByTestId('menu-quick-filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: /% Off \(2\)/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Promos \(1\)/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Top sellers \(4\)/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Top sellers/i }));
    expect(onChange).toHaveBeenCalledWith('bestseller');
  });

  it('toggles off when the active chip is pressed again', () => {
    const onChange = vi.fn();
    render(
      <MenuQuickFilters
        saleFilter="discount"
        onChange={onChange}
        discountCount={3}
        specialCount={0}
        bestsellerCount={0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /% Off/i }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
