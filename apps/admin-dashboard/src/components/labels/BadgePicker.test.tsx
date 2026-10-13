import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BADGE_FALLBACK, BadgePicker, badgeLabel } from './BadgePicker';
import { QuickEditSheet, quickSpec } from './QuickEdit';

/*
 * Badges (round 9, 2026-10-13): up to four from the catalogue, as pills that
 * toggle; the tap sheet for the badges part offers the same chips.
 */
describe('BadgePicker', () => {
  it('toggles badges, keeps to four, and says what is picked', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BadgePicker value={[]} onChange={onChange} catalogue={[]} />);
    const group = screen.getByRole('group', { name: 'Badges' });
    expect(within(group).getAllByRole('button')).toHaveLength(BADGE_FALLBACK.length);
    expect(screen.getByTestId('badges-hint')).toHaveTextContent('Up to 4');
    fireEvent.click(within(group).getByRole('button', { name: 'HALAL' }));
    expect(onChange).toHaveBeenCalledWith(['halal']);

    rerender(<BadgePicker value={['halal', 'spicy', 'new', 'vegan']} onChange={onChange} catalogue={[{ key: 'halal', label: 'Halal', word: 'HALAL', word_dv: '' }, { key: 'spicy', label: 'Spicy', word: 'SPICY', word_dv: '' }, { key: 'new', label: 'New', word: 'NEW', word_dv: '' }, { key: 'vegan', label: 'Vegan', word: 'VEGAN', word_dv: '' }, { key: 'homemade', label: 'Homemade', word: 'HOMEMADE', word_dv: '' }]} />);
    expect(screen.getByTestId('badges-hint')).toHaveTextContent('4 of 4: Halal, Spicy, New, Vegan.');
    expect(screen.getByRole('button', { name: 'HOMEMADE' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'HALAL' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'SPICY' }));
    expect(onChange).toHaveBeenLastCalledWith(['halal', 'new', 'vegan']);
    expect(badgeLabel('gluten_free')).toBe('Gluten-free');
    expect(badgeLabel('nope')).toBe('nope');
  });

  it('is a chips input on the tap sheet for the badges part', () => {
    const onChange = vi.fn();
    const spec = quickSpec('badges', { kind: 'custom', badges: [{ key: 'halal', label: 'Halal', word: 'HALAL', word_dv: '' }, { key: 'spicy', label: 'Spicy', word: 'SPICY', word_dv: '' }] });
    expect(spec.inputs[0]).toMatchObject({ key: 'label_badges', kind: 'chips', max: 4 });
    render(<MemoryRouter><QuickEditSheet spec={spec} values={{ label_badges: ['halal'] }} onChange={onChange} onDone={() => {}} idPrefix="t" /></MemoryRouter>);
    const chips = within(screen.getByTestId('t-chips'));
    expect(chips.getByRole('button', { name: 'HALAL' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chips.getByRole('button', { name: 'SPICY' }));
    expect(onChange).toHaveBeenCalledWith('label_badges', ['halal', 'spicy']);
    fireEvent.click(chips.getByRole('button', { name: 'HALAL' }));
    expect(onChange).toHaveBeenLastCalledWith('label_badges', []);
    // With no catalogue the built-in list stands in.
    expect(quickSpec('badges', { kind: 'item' }).inputs[0].options).toHaveLength(BADGE_FALLBACK.length);
  });
});
