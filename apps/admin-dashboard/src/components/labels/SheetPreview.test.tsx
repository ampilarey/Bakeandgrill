import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SheetPreview } from './SheetPreview';

/*
 * Owner, 2026-10-26: "add option to view preview in label bigger, when clicked,
 * it opens full screen, and option to close this full screen".
 */
describe('SheetPreview full screen', () => {
  it('opens the same page full screen and closes with Close, Escape or a tap outside', () => {
    const outerEscape = vi.fn();
    window.addEventListener('keydown', outerEscape);
    render(<SheetPreview url="/labels/stickers?preview=1&sig=x" ratio={4.5} />);

    fireEvent.click(screen.getByTestId('sheet-preview-bigger'));
    const full = screen.getByTestId('sheet-preview-full');
    expect(full.querySelector('iframe')?.getAttribute('src')).toBe(`${window.location.origin}/labels/stickers?preview=1&sig=x`);

    fireEvent.click(screen.getByTestId('sheet-preview-full-close'));
    expect(screen.queryByTestId('sheet-preview-full')).toBeNull();

    fireEvent.click(screen.getByTestId('sheet-preview-bigger'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sheet-preview-full')).toBeNull();
    expect(outerEscape).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('sheet-preview-bigger'));
    fireEvent.mouseDown(screen.getByTestId('sheet-preview-full'));
    expect(screen.queryByTestId('sheet-preview-full')).toBeNull();
    window.removeEventListener('keydown', outerEscape);
  });

  it('offers no bigger view while there is nothing to show', () => {
    render(<SheetPreview url={null} ratio={1} />);
    expect(screen.queryByTestId('sheet-preview-bigger')).toBeNull();
  });
});
