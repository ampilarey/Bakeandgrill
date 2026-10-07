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

  /** Owner, 2026-10-07: "keep the main category in the rail and sub category below the banner". */
  it('lists main categories only, each a photo tile, with a ring that marks the chosen one', () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <CategoryRail
        categories={[
          { id: 1, name: 'Breakfast Specials', sort_order: 1 },
          { id: 2, name: 'Grills', sort_order: 2, image_url: '/media/grills.jpg' },
        ]}
        activeCategoryId={2}
        onSelect={onSelect}
        counts={{ 2: 5 }}
      />,
    );

    expect(container.querySelector('.cat-rail__sub')).toBeNull();
    const grills = screen.getByRole('tab', { name: 'Grills, 5 items' });
    expect(grills).toHaveClass('is-active');
    expect(grills.querySelector('img')?.getAttribute('src')).toContain('/media/grills.jpg');
    // No visible count on the tile; it lives in the accessible name only.
    expect(grills.textContent?.trim()).toBe('Grills');
    // No photo → tinted initial.
    expect(screen.getByRole('tab', { name: /Breakfast/ }).querySelector('.cat-rail__thumb')?.textContent).toBe('B');
    // The ring sits on the chosen tile.
    expect(container.querySelector('.cat-rail__pill')).toHaveClass('is-on');

    screen.getByRole('tab', { name: /Breakfast/ }).click();
    expect(onSelect).toHaveBeenCalledWith(1);

    rerender(<CategoryRail categories={cats} activeCategoryId={null} onSelect={() => {}} />);
    expect(container.querySelector('.cat-rail__pill')).not.toHaveClass('is-on');
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

  /** Owner, 2026-09-21: "'other' items that are not in category does not show the tab in rail." */
  it('offers an Other entry after the categories and before Events, only when asked', () => {
    const onOtherClick = vi.fn();
    const { container, rerender } = render(
      <CategoryRail
        categories={cats}
        activeCategoryId={1}
        onSelect={() => {}}
        showOtherPill
        otherCount={3}
        onOtherClick={onOtherClick}
        showCateringPill
        onCateringClick={() => {}}
      />,
    );
    const labels = Array.from(container.querySelectorAll('[role="tab"] .cat-rail__label')).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Breakfast Specials', 'Grills', 'Other', 'Events']);

    const other = screen.getByRole('tab', { name: 'Other, 3 items' });
    expect(other.getAttribute('aria-selected')).toBe('false');
    other.click();
    expect(onOtherClick).toHaveBeenCalledTimes(1);

    rerender(
      <CategoryRail
        categories={cats}
        activeCategoryId={null}
        onSelect={() => {}}
        showOtherPill
        otherActive
        otherCount={3}
        onOtherClick={onOtherClick}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Other, 3 items' })).toHaveClass('is-active');

    rerender(<CategoryRail categories={cats} activeCategoryId={1} onSelect={() => {}} />);
    expect(container.querySelector('[data-testid="cat-rail-other"]')).toBeNull();
  });

  /** Owner, 2026-09-21: the hand-picked strip leads the menu, so its entry leads the rail. */
  it('leads with the featured entry under the owner\'s heading, only when asked', () => {
    const onFeaturedClick = vi.fn();
    const { container, rerender } = render(
      <CategoryRail
        categories={cats}
        activeCategoryId={1}
        onSelect={() => {}}
        showFeaturedPill
        featuredLabel="Favourites"
        onFeaturedClick={onFeaturedClick}
        showCateringPill
        onCateringClick={() => {}}
      />,
    );
    const labels = Array.from(container.querySelectorAll('[role="tab"] .cat-rail__label')).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Favourites', 'Breakfast Specials', 'Grills', 'Events']);

    screen.getByRole('tab', { name: 'Favourites' }).click();
    expect(onFeaturedClick).toHaveBeenCalledTimes(1);

    // Lit while its section is the one in view, like any category.
    rerender(
      <CategoryRail categories={cats} activeCategoryId={null} onSelect={() => {}} showFeaturedPill featuredActive featuredLabel="Favourites" onFeaturedClick={onFeaturedClick} />,
    );
    expect(screen.getByRole('tab', { name: 'Favourites' })).toHaveClass('is-active');

    rerender(<CategoryRail categories={cats} activeCategoryId={1} onSelect={() => {}} />);
    expect(container.querySelector('[data-testid="cat-rail-featured"]')).toBeNull();
  });
});
