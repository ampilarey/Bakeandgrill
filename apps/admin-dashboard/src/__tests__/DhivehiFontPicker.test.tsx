import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DhivehiFontPicker } from '../pages/ContentHub/DhivehiFontPicker';

/* Pick the Dhivehi font from the shipped faces or an upload (2026-10-18). */
describe('DhivehiFontPicker', () => {
  it('offers the shipped faces with a sample each and picks one', () => {
    const onPick = vi.fn();
    render(<DhivehiFontPicker value="" onPick={onPick} onUpload={vi.fn()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent?.split('ބޭކް')[0])).toEqual(['Faruma', 'Noto Sans Thaana', 'FreeSerif', "The phone's own"]);
    expect(screen.getByTestId('dv-font-faruma')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('dv-font-preset:noto'));
    expect(onPick).toHaveBeenCalledWith('preset:noto');
  });

  it('shows an uploaded font as its own picked card', () => {
    const url = `/storage/fonts/${'a'.repeat(64)}.woff2`;
    render(<DhivehiFontPicker value={url} onPick={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByTestId(`dv-font-${url}`)).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Your uploaded font')).toBeTruthy();
  });
});
