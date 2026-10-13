import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LabelsTour, TOUR_KEY, openLabelsTour } from './LabelsTour';

/*
 * The first-visit tour (round 5, 2026-10-13): four cards once per browser,
 * Done or closing keeps it away, How it works brings it back.
 */
describe('LabelsTour', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('shows four cards on the first visit, then stays away until asked for', () => {
    const { unmount } = render(<LabelsTour />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Make a label in four steps');
    expect(screen.getByTestId('labels-tour')).toHaveAttribute('data-step', '1');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('labels-tour-next'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Tap the label to change it');
    fireEvent.click(screen.getByTestId('labels-tour-next'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Any size, any shape');
    fireEvent.click(screen.getByTestId('labels-tour-next'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Where things live');
    expect(screen.getByRole('dialog')).toHaveTextContent('Print labels prints. Custom labels is for things not on the menu.');
    expect(screen.queryByTestId('labels-tour-next')).toBeNull();
    fireEvent.click(screen.getByTestId('labels-tour-done'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(TOUR_KEY)).toBe('seen');
    unmount();

    // Seen: nothing on the next visit, until How it works asks for it.
    render(<LabelsTour />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => { openLabelsTour(); });
    expect(screen.getByRole('dialog')).toHaveTextContent('Make a label in four steps');
    // Closing with the X counts as seen too.
    fireEvent.click(screen.getByTestId('shared-modal-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
