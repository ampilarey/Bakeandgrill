import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShelfLifeHint } from './ShelfLifeHint';

/* Round 15 (2026-10-13): a shelf life to suggest by storage, with Use to fill it. */
const suggestions = {
  frozen: { days: 90, why: 'Cooked and frozen at -18°C: about three months keeps the taste and texture.' },
  chilled: { days: 3, why: 'Cooked and kept at 0–4°C: eat within three days.' },
  ambient: { days: 2, why: 'Baked and kept cool and dry: best within two days.' },
};

describe('ShelfLifeHint', () => {
  it('suggests the usual shelf life for the storage and fills it on Use', () => {
    const onUse = vi.fn();
    render(<ShelfLifeHint storage="chilled" value="" suggestions={suggestions} onUse={onUse} />);
    expect(screen.getByTestId('shelf-life-hint')).toHaveTextContent('Usual for chilled: 3 days.');
    expect(screen.getByTestId('shelf-life-hint')).toHaveTextContent('eat within three days');
    fireEvent.click(screen.getByRole('button', { name: 'Use 3' }));
    expect(onUse).toHaveBeenCalledWith(3);
  });

  it('says nothing when the box already holds it, and offers no button when locked', () => {
    const { rerender } = render(<ShelfLifeHint storage="frozen" value={90} suggestions={suggestions} onUse={vi.fn()} />);
    expect(screen.queryByTestId('shelf-life-hint')).toBeNull();
    rerender(<ShelfLifeHint storage="frozen" value={30} suggestions={suggestions} onUse={vi.fn()} disabled />);
    expect(screen.getByTestId('shelf-life-hint')).toHaveTextContent('Usual for frozen: 90 days.');
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ShelfLifeHint storage="frozen" value={30} suggestions={null} />);
    expect(screen.queryByTestId('shelf-life-hint')).toBeNull();
  });
});
