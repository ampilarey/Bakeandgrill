import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CutoutBackdropField } from '../components/CutoutBackdropField';
import { normalizeBackdrop } from '../api/cutout';

/* Owner, 2026-10-01: the circle behind a cut-out, settable per level. */

describe('CutoutBackdropField', () => {
  it('starts on "same as" and previews what is inherited', () => {
    render(
      <CutoutBackdropField
        value={null}
        onChange={vi.fn()}
        inheritLabel="the category"
        inherited={{ color: '#112233', strength: 40 }}
      />,
    );

    expect(screen.getByTestId('cutout-backdrop-inherit')).toBeChecked();
    expect(screen.getByText(/Same as the category/)).toBeInTheDocument();
    expect(screen.getByText('(#112233, 40%)')).toBeInTheDocument();
    const preview = screen.getByTestId('cutout-preview');
    expect(preview.dataset.color).toBe('#112233');
    expect(preview.dataset.strength).toBe('40');
    expect(screen.queryByTestId('cutout-backdrop-strength')).toBeNull();
  });

  it('choosing its own circle starts from the inherited values, then edits them', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CutoutBackdropField value={null} onChange={onChange} inheritLabel="the category" inherited={{ color: '#112233', strength: 40 }} />,
    );

    fireEvent.click(screen.getByTestId('cutout-backdrop-own'));
    expect(onChange).toHaveBeenLastCalledWith({ color: '#112233', strength: 40 });

    rerender(
      <CutoutBackdropField value={{ color: '#112233', strength: 40 }} onChange={onChange} inheritLabel="the category" inherited={{ color: '#112233', strength: 40 }} />,
    );
    fireEvent.change(screen.getByTestId('cutout-backdrop-strength'), { target: { value: '75' } });
    expect(onChange).toHaveBeenLastCalledWith({ color: '#112233', strength: 75 });

    fireEvent.change(screen.getByLabelText('Circle colour hex'), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith({ color: '#ABCDEF', strength: 40 });
  });

  it('going back to "same as" clears the override', () => {
    const onChange = vi.fn();
    render(
      <CutoutBackdropField value={{ color: '#ABCDEF', strength: 50 }} onChange={onChange} inheritLabel="the menu default" />,
    );

    expect(screen.getByTestId('cutout-backdrop-own')).toBeChecked();
    fireEvent.click(screen.getByTestId('cutout-backdrop-inherit'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('normalizeBackdrop', () => {
  it('tidies colours and clamps strength, and drops an empty backdrop', () => {
    expect(normalizeBackdrop(null)).toBeNull();
    expect(normalizeBackdrop({ color: null, strength: null })).toBeNull();
    expect(normalizeBackdrop({ color: 'nope', strength: null })).toBeNull();
    expect(normalizeBackdrop({ color: ' #abcdef ', strength: 140 })).toEqual({ color: '#ABCDEF', strength: 100 });
    expect(normalizeBackdrop({ color: null, strength: 33.6 })).toEqual({ color: null, strength: 34 });
  });
});
