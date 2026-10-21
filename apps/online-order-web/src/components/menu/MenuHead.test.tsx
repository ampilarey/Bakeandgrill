import { createRef } from 'react';
import { act, render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuHead, type MenuHeadHandle, type MenuHeadSection } from './MenuHead';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}));

const sections: MenuHeadSection[] = [
  {
    key: 'cat-1', domId: 'sec-1', name: 'Food', count: 5, image: '/media/food.jpg', tint: 'red',
    share: { url: 'https://x/menu/c/food', title: 'Food', ariaLabel: 'Share Food' },
    subs: [
      { domId: 'sub-a', name: 'Shorteats', count: 3 },
      { domId: 'sub-b', name: 'Fast food', count: 2 },
    ],
  },
  { key: 'cat-2', domId: 'sec-2', name: 'Drinks', count: 4, image: null, tint: 'blue', share: null, subs: [{ domId: 'sub-c', name: 'Hot', count: 4 }] },
];

function page() {
  return (
    <>
      <section id="sec-1"><div id="sub-a" /><div id="sub-b" /></section>
      <section id="sec-2"><div id="sub-c" /></section>
    </>
  );
}

/** Owner, 2026-10-07: "keep the main category in the rail and sub category below the banner". */
describe('MenuHead', () => {
  /** Owner, 2026-10-22: the pinned strip showed only a slice of the 7:3 banner. */
  it('is the whole banner at the top and folds to a strip, the section tint behind the name, once pinned', () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const at = (top: number) => ({ top, bottom: top + 100, left: 0, right: 300, width: 300, height: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    rect.mockReturnValue(at(200));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const ref = createRef<MenuHeadHandle>();
    render(<>{page()}<MenuHead ref={ref} sections={sections} searchOpen={false} searchActive={false} onSearchToggle={() => {}} /></>);
    const head = screen.getByTestId('menu-head');
    const banner = head.querySelector('.mh-banner') as HTMLElement;

    // Above its pinning point: not folded; the section's tint is ready behind the name.
    act(() => ref.current?.goTo('sec-1', true));
    expect(head).not.toHaveClass('is-stuck');
    expect(banner).not.toHaveClass('mh-banner--plain');
    expect(banner.style.getPropertyValue('--mh-tint')).toBe('red');

    // At its pinning point: folded.
    rect.mockReturnValue(at(0));
    act(() => { fireEvent(window, new Event('resize')); });
    expect(head).toHaveClass('is-stuck');

    // A section without a photo wears its tint as the banner itself.
    act(() => ref.current?.goTo('sec-2', true));
    expect(banner).toHaveClass('mh-banner--plain');
    expect(banner.style.getPropertyValue('--mh-tint')).toBe('blue');
    rect.mockRestore();
  });

  it('shows the section in view with its photo, count, Share and its sub-categories as buttons', () => {
    const ref = createRef<MenuHeadHandle>();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<>{page()}<MenuHead ref={ref} sections={sections} searchOpen={false} searchActive={false} onSearchToggle={() => {}} /></>);

    act(() => ref.current?.goTo('sec-1', true));
    const head = screen.getByTestId('menu-head');
    expect(head.querySelector('.mh-title')).toHaveTextContent('Food');
    expect(screen.getByTestId('menu-head-count')).toHaveTextContent('5 items');
    expect(head.querySelector('.mh-img.is-on')?.getAttribute('style')).toContain('/media/food.jpg');
    expect(within(head).getByRole('button', { name: 'Share Food' })).toBeInTheDocument();

    // Buttons only for a section with two or more sub-categories.
    const rows = screen.getAllByTestId('menu-head-chips');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveClass('is-on');
    expect(within(rows[0]).getByRole('button', { name: /Shorteats/ })).toHaveClass('is-active');

    // A tap on a button moves the highlight there at once.
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Fast food/ }));
    expect(within(rows[0]).getByRole('button', { name: /Fast food/ })).toHaveClass('is-active');
    expect(scrollTo).toHaveBeenCalled();

    // Another section: its name, no Share when it has none, its row steps aside.
    act(() => ref.current?.goTo('sec-2', true));
    expect(head.querySelector('.mh-title')).toHaveTextContent('Drinks');
    expect(within(head).queryByRole('button', { name: /Share/ })).toBeNull();
    expect(rows[0]).not.toHaveClass('is-on');
    // Owner, 2026-10-07: no empty strip under the banner when a section has
    // no buttons; room at the top only because the first section has some.
    expect(head).not.toHaveClass('has-row');
    expect(head).toHaveClass('mh--room');
    act(() => ref.current?.goTo('sec-1', true));
    expect(head).toHaveClass('has-row');
    scrollTo.mockRestore();
  });

  it('names search results instead of a section and opens the search panel under the buttons', () => {
    const onSearchToggle = vi.fn();
    const { rerender } = render(
      <>{page()}<MenuHead sections={sections} override={{ name: 'Results', count: 2 }} searchOpen searchActive onSearchToggle={onSearchToggle}><input data-testid="q" /></MenuHead></>,
    );
    expect(screen.getByTestId('menu-head').querySelector('.mh-title')).toHaveTextContent('Results');
    expect(screen.getByTestId('menu-head-count')).toHaveTextContent('2 items');
    expect(screen.queryAllByTestId('menu-head-chips')).toHaveLength(0);
    expect(within(screen.getByTestId('menu-controls')).getByTestId('q')).toBeInTheDocument();
    const toggle = screen.getByTestId('menu-controls-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(onSearchToggle).toHaveBeenCalledTimes(1);

    rerender(<>{page()}<MenuHead sections={sections} searchOpen={false} searchActive={false} onSearchToggle={onSearchToggle} /></>);
    expect(screen.queryByTestId('menu-controls')).toBeNull();
  });

  it('closes the open search panel on a tap or a scroll anywhere outside it', () => {
    // Owner, 2026-10-07: "it should be hidden on any click outside the box",
    // and "when i touch to scroll".
    const onSearchClose = vi.fn();
    render(
      <>{page()}<p>Dish</p><MenuHead sections={sections} searchOpen searchActive={false} onSearchToggle={() => {}} onSearchClose={onSearchClose}><input data-testid="q" /></MenuHead></>,
    );
    const dish = screen.getByText('Dish');
    const tap = (el: Element) => {
      fireEvent.pointerDown(el, { pointerId: 1 });
      fireEvent.pointerUp(el, { pointerId: 1 });
    };
    // Inside the panel, or on its own button: stays open.
    tap(screen.getByTestId('q'));
    tap(screen.getByTestId('menu-controls-toggle'));
    fireEvent.wheel(screen.getByTestId('q'));
    expect(onSearchClose).not.toHaveBeenCalled();
    // A tap outside closes it on lift, not on touch.
    fireEvent.pointerDown(dish, { pointerId: 1 });
    expect(onSearchClose).not.toHaveBeenCalled();
    fireEvent.pointerUp(dish, { pointerId: 1 });
    expect(onSearchClose).toHaveBeenCalledTimes(1);
    // A finger that starts scrolling the page closes it as the scroll starts.
    fireEvent.pointerDown(dish, { pointerId: 2 });
    fireEvent.pointerCancel(dish, { pointerId: 2 });
    expect(onSearchClose).toHaveBeenCalledTimes(2);
    // So does a mouse wheel.
    fireEvent.wheel(dish);
    expect(onSearchClose).toHaveBeenCalledTimes(3);
  });
});
