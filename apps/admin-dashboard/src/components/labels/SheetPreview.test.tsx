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
  it('keeps the label on screen while the next one loads, then swaps without a blank', () => {
    const { rerender } = render(<SheetPreview url="/labels/a" ratio={2} title="Label" />);
    const first = screen.getByTitle('Label') as HTMLIFrameElement;
    expect(first.style.opacity).toBe('0');
    fireEvent.load(first);
    expect((screen.getByTitle('Label') as HTMLIFrameElement).style.opacity).toBe('1');

    rerender(<SheetPreview url="/labels/b" ratio={2} title="Label" />);
    // The old page is still showing; the new one waits underneath.
    expect((screen.getByTitle('Label (previous)') as HTMLIFrameElement).style.opacity).toBe('1');
    expect((screen.getByTitle('Label') as HTMLIFrameElement).style.opacity).toBe('0');
    expect(screen.getByTestId('sheet-preview-updating')).toBeTruthy();
    expect(screen.queryByText('Updating')).toBeNull();

    fireEvent.load(screen.getByTitle('Label'));
    expect(screen.queryByTitle('Label (previous)')).toBeNull();
    expect((screen.getByTitle('Label') as HTMLIFrameElement).style.opacity).toBe('1');
    expect(screen.queryByTestId('sheet-preview-updating')).toBeNull();
  });

  it('puts View bigger under the label, not over it', () => {
    render(<SheetPreview url="/labels/a" ratio={2} title="Label" />);
    expect(screen.getByTestId('sheet-preview').contains(screen.getByTestId('sheet-preview-bigger'))).toBe(false);
  });
});
