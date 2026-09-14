import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabScrollRow } from '../components/SharedUI';

/*
 * Phone sweep, 2026-09-14: a tab strip that scrolls sideways gave no sign
 * that more tabs sat off the right-hand edge. The row measures itself and
 * marks the edge that has more to see; jsdom has no layout, so the sizes
 * are stubbed on the prototype.
 */

const sizes: { client: number; scroll: number } = { client: 0, scroll: 0 };
const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const scrollDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

function stubSizes(client: number, scroll: number) {
  sizes.client = client;
  sizes.scroll = scroll;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => sizes.client });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => sizes.scroll });
}

afterEach(() => {
  if (clientDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientDesc);
  if (scrollDesc) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollDesc);
});

describe('TabScrollRow', () => {
  it('marks the right edge when the tabs run past it, and clears it once scrolled to the end', () => {
    stubSizes(300, 600);
    render(
      <TabScrollRow role="tablist" aria-label="Things">
        <button role="tab" aria-selected>One</button>
        <button role="tab">Two</button>
      </TabScrollRow>,
    );
    const row = screen.getByRole('tablist', { name: 'Things' });
    const wrap = row.parentElement!;
    expect(wrap).toHaveAttribute('data-fade-right');
    expect(wrap).not.toHaveAttribute('data-fade-left');

    row.scrollLeft = 300;
    fireEvent.scroll(row);
    expect(wrap).toHaveAttribute('data-fade-left');
    expect(wrap).not.toHaveAttribute('data-fade-right');
  });

  it('shows no cue at all when every tab fits', () => {
    stubSizes(600, 600);
    render(
      <TabScrollRow aria-label="Fits">
        <button aria-current="true">One</button>
        <button>Two</button>
      </TabScrollRow>,
    );
    const wrap = screen.getByLabelText('Fits').parentElement!;
    expect(wrap).not.toHaveAttribute('data-fade-right');
    expect(wrap).not.toHaveAttribute('data-fade-left');
  });

  it('keeps the row as wide as its tabs only when asked', () => {
    stubSizes(600, 600);
    const { rerender } = render(<TabScrollRow aria-label="Row" fit><button>A</button></TabScrollRow>);
    expect(screen.getByLabelText('Row').parentElement).toHaveClass('tab-scroll-wrap--fit');
    rerender(<TabScrollRow aria-label="Row"><button>A</button></TabScrollRow>);
    expect(screen.getByLabelText('Row').parentElement).not.toHaveClass('tab-scroll-wrap--fit');
  });
});
