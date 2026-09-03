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

  it('lists sub-categories under their parent as smaller tabs that jump on their own', () => {
    const onSelect = vi.fn();
    const onSelectSubcategory = vi.fn();
    const { container } = render(
      <CategoryRail
        categories={cats}
        activeCategoryId={2}
        activeSubcategoryId={21}
        onSelect={onSelect}
        onSelectSubcategory={onSelectSubcategory}
        subcategories={{ 2: [{ id: 21, name: 'Chicken', parent_id: 2 }, { id: 22, name: 'Beef', parent_id: 2 }] }}
        counts={{ 2: 5, 21: 3, 22: 2 }}
      />,
    );

    // Under Grills, not under Breakfast Specials, and after the parent tab.
    const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((el) => (
      el.querySelector('.cat-rail__label, .cat-rail__sub-label')?.textContent?.trim()
    ));
    expect(tabs).toEqual(['Breakfast Specials', 'Grills', 'Chicken', 'Beef']);

    const chicken = screen.getByRole('tab', { name: /Chicken/ });
    expect(chicken).toHaveClass('cat-rail__sub');
    expect(chicken.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Beef/ }).getAttribute('aria-selected')).toBe('false');
    // The parent stays lit while one of its sub-categories is in view.
    expect(screen.getByRole('tab', { name: /Grills/ }).getAttribute('aria-selected')).toBe('true');
    // A sub-entry has its own, smaller photo (tinted initial here — no image).
    expect(chicken.querySelector('.cat-rail__thumb--sub')?.textContent).toBe('C');

    screen.getByRole('tab', { name: /Beef/ }).click();
    expect(onSelectSubcategory).toHaveBeenCalledWith(22, 2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** Owner, 2026-09-03: "add photos to subcategory also … main category big and subcategory little smaller". */
  it('gives every entry a photo, one size smaller for a sub-category, and lists sub-categories whether or not the parent is active', () => {
    const { container } = render(
      <CategoryRail
        categories={[
          { id: 1, name: 'Breakfast Specials', sort_order: 1 },
          { id: 2, name: 'Grills', sort_order: 2, image_url: '/media/grills.jpg' },
        ]}
        activeCategoryId={1}
        onSelect={() => {}}
        onSelectSubcategory={() => {}}
        subcategories={{ 2: [
          { id: 21, name: 'Chicken', parent_id: 2, image_url: '/media/chicken.jpg' },
          { id: 22, name: 'Beef', parent_id: 2 },
        ] }}
        counts={{ 21: 3 }}
      />,
    );

    // Not folded away: Grills is not the active category, its children still show.
    expect(container.querySelectorAll('[data-testid="cat-rail-sub"]').length).toBe(2);

    // Sizes live in the stylesheet (they fit the rail width per breakpoint);
    // the intrinsic hints say which is the bigger one.
    const grillsImg = screen.getByRole('tab', { name: /Grills/ }).querySelector('img');
    expect(grillsImg?.getAttribute('width')).toBe('64');
    expect(grillsImg).toHaveClass('cat-rail__thumb');
    expect(grillsImg).not.toHaveClass('cat-rail__thumb--sub');
    const chickenImg = screen.getByRole('tab', { name: 'Chicken, 3 items' }).querySelector('img');
    expect(chickenImg?.getAttribute('src')).toContain('/media/chicken.jpg');
    expect(chickenImg?.getAttribute('width')).toBe('52');
    expect(chickenImg).toHaveClass('cat-rail__thumb--sub');
    // No image → tinted initial, still the smaller size class.
    const beefThumb = screen.getByRole('tab', { name: /Beef/ }).querySelector('.cat-rail__thumb--sub') as HTMLElement;
    expect(beefThumb.textContent).toBe('B');
    // No visible count on a sub-entry; it lives in the accessible name only.
    expect(screen.getByRole('tab', { name: 'Chicken, 3 items' }).textContent?.trim()).toBe('Chicken');
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


