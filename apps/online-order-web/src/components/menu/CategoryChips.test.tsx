import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryChips } from './CategoryChips';
import type { Category } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: 'en',
  }),
}));

const cats: Category[] = [
  { id: 1, name: 'Breakfast', sort_order: 1 },
  { id: 2, name: 'Grills', sort_order: 2 },
  { id: 3, name: 'Drinks', sort_order: 3 },
];

describe('CategoryChips', () => {
  it('renders sticky chips and reflects the active category', () => {
    render(
      <CategoryChips
        categories={cats}
        activeCategoryId={2}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId('menu-cat-chips')).toBeTruthy();
    const active = screen.getByRole('tab', { name: 'Grills' });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.className).toContain('is-active');
    expect(screen.getByRole('tab', { name: 'Breakfast' }).getAttribute('aria-selected')).toBe('false');
  });
});
