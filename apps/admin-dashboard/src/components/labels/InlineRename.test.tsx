import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineRename } from './InlineRename';

// Labels audit, 2026-10-11: a saved label is renamed in place, not in a browser prompt box.
describe('InlineRename', () => {
  it('turns the name into a box, saves a changed name and ignores an unchanged or empty one', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InlineRename name="Bajiya ×4" onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Bajiya ×4' }));
    const box = screen.getByLabelText('New name');
    expect(box).toHaveValue('Bajiya ×4');
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByTestId('inline-rename')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Bajiya ×4' }));
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'Morning sheet' } });
    fireEvent.submit(screen.getByTestId('inline-rename'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Morning sheet'));
    expect(screen.queryByTestId('inline-rename')).toBeNull();
  });

  it('cancels with Escape', () => {
    render(<InlineRename name="Box" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Box' }));
    fireEvent.keyDown(screen.getByLabelText('New name'), { key: 'Escape' });
    expect(screen.queryByTestId('inline-rename')).toBeNull();
  });
});
