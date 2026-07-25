import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryRail } from './CategoryRail';
import type { Category } from '../../api';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    lang: 'en',
  }),
}));

const cats: Category[] = [
  { id: 1, name: 'Breakfast Specials', sort_order: 1 },
  { id: 2, name: 'Grills', sort_order: 2 },
];

describe('CategoryRail', () => {
  it('renders icon + label for each category and reflects active', () => {
    const { container } = render(
      <CategoryRail
        categories={cats}
        activeCategoryId={2}
        onSelect={() => {}}
      />,
    );

    expect(container.querySelector('.cat-rail')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Grills/i }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Breakfast Specials/i }).getAttribute('aria-selected')).toBe('false');

    const labels = container.querySelectorAll('.cat-rail__label');
    expect(labels.length).toBe(2);
    labels.forEach((el) => {
      const style = window.getComputedStyle(el);
      // Labels must remain visible (bug was font-size: 0 on mobile)
      expect(style.fontSize === '0px' || style.fontSize === '0').toBe(false);
      expect(el.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it('places Events shortcut after regular categories on the left rail', () => {
    const { container } = render(
      <CategoryRail
        categories={cats}
        activeCategoryId={1}
        onSelect={() => {}}
        showCateringPill
        cateringCount={2}
        onCateringClick={() => {}}
      />,
    );
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const labels = tabs.map((el) => el.textContent?.replace(/\d+$/, '').trim());
    expect(labels[labels.length - 1]).toMatch(/Events/i);
    expect(container.querySelector('[data-testid="cat-rail-events"]')).toBeTruthy();
  });
});


