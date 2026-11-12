import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExpiryChips, expiryForNewMfg, monthsAfter } from './ExpiryChips';

// Owner, 2026-11-12: "add easy expire date selection. 1 month, 2, 3".
describe('ExpiryChips', () => {
  it('adds whole calendar months, landing on the last day of a short month', () => {
    expect(monthsAfter('2026-11-12', 1)).toBe('2026-12-12');
    expect(monthsAfter('2026-11-12', 3)).toBe('2027-02-12');
    expect(monthsAfter('2026-01-31', 1)).toBe('2026-02-28');
    expect(monthsAfter('', 1)).toBe('');
  });

  it('sets the expiry in one tap and goes back to the shelf life', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ExpiryChips mfg="2026-11-12" value="" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Shelf life' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '3 months' }));
    expect(onChange).toHaveBeenCalledWith('2027-02-12');
    rerender(<ExpiryChips mfg="2026-11-12" value="2027-02-12" onChange={onChange} />);
    expect(screen.getByRole('button', { name: '3 months' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Shelf life' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('moves a months pick with the made-on date, and leaves a typed date alone', () => {
    expect(expiryForNewMfg('2026-11-12', '2026-11-20', '2026-12-12')).toBe('2026-12-20');
    expect(expiryForNewMfg('2026-11-12', '2026-11-20', '2026-12-25')).toBe('2026-12-25');
    expect(expiryForNewMfg('2026-11-12', '2026-11-20', '')).toBe('');
  });
});
