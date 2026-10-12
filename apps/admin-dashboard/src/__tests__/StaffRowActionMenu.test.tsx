import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowActionMenu } from '../pages/StaffPage';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual };
});

/**
 * Owner, 2026-10-12, from a phone: the Staff row's More menu opened to the
 * left of its button, off the card, and read "hange PIN", "isable login".
 * It now hangs from whichever side has room.
 */
describe('Staff row More menu', () => {
  const items = [
    { label: 'Change PIN', onClick: () => {} },
    { label: 'Remove', onClick: () => {}, danger: true },
  ];

  function mockButtonAt(left: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left, right: left + 80, top: 100, bottom: 132, width: 80, height: 32, x: left, y: 100, toJSON: () => ({}),
    } as DOMRect);
  }

  beforeEach(() => vi.restoreAllMocks());

  it('hangs from the left on a phone, where the button sits at the card edge', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
    mockButtonAt(70);
    render(<RowActionMenu items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByTestId('row-action-menu');
    expect(menu.getAttribute('data-side')).toBe('left');
    expect(menu.style.left).toBe('0px');
    expect(menu.style.right).toBe('');
    expect(screen.getByText('Change PIN')).toBeInTheDocument();
  });

  it('hangs from the right on a computer, where the button sits in the last column', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1366 });
    mockButtonAt(1250);
    render(<RowActionMenu items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByTestId('row-action-menu');
    expect(menu.getAttribute('data-side')).toBe('right');
    expect(menu.style.right).toBe('0px');
  });
});
