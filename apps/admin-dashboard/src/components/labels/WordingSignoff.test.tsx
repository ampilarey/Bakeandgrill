import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The wording lock (round 17, 2026-10-13): a label's legal lines, where they
 * stand against the last sign-off, Sign off, and the Settings card's lock
 * switch with every label's state.
 */
const api = vi.hoisted(() => ({ fetchLabelSignoff: vi.fn(), signOffLabel: vi.fn(), fetchLabelSignoffs: vi.fn(), saveLabelSettings: vi.fn() }));
vi.mock('../../api', () => api);
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { WordingSignoff, signoffWords } from './WordingSignoff';
import { WordingLockCard } from './WordingLockCard';

const lines = { name: 'Bajiya', name_dv: '', ingredients: 'Flour, egg, tuna, chilli', ingredients_dv: '', allergens: 'egg', storage: 'KEEP FROZEN', storage_dv: '', use_within: '', net_weight: '', nutrition: '' };
const changed = {
  kind: 'item' as const, id: 7, name: 'Bajiya', state: 'changed' as const, lines, changed: ['ingredients'],
  signed: { id: 3, by: 'Aminath', at: '2026-10-12T09:00:00+05:00', note: 'Checked', lines: { ...lines, ingredients: 'Flour, egg, tuna' } },
  locked: true, printable: false,
};

describe('WordingSignoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows what changed since the sign-off and signs the lines off again', async () => {
    api.fetchLabelSignoff.mockResolvedValue({ data: changed, lines: {} });
    api.signOffLabel.mockResolvedValue({ data: { ...changed, state: 'signed', changed: [], printable: true, signed: { ...changed.signed, id: 4, lines, note: 'Chilli added' } } });
    render(<WordingSignoff kind="item" id={7} canManage />);
    const box = await screen.findByTestId('wording-signoff');
    expect(within(box).getByTestId('signoff-chip')).toHaveAttribute('data-state', 'changed');
    expect(within(box).getByTestId('signoff-words')).toHaveTextContent('Changed since the sign-off: Ingredients');
    expect(within(box).getByTestId('signoff-line-ingredients')).toHaveTextContent('Flour, egg, tuna, chilliFlour, egg, tuna');
    expect(box).toHaveTextContent('Will not print until signed off: the wording is locked.');
    fireEvent.change(within(box).getByLabelText('Sign-off note'), { target: { value: 'Chilli added' } });
    fireEvent.click(within(box).getByTestId('signoff-button'));
    await waitFor(() => expect(api.signOffLabel).toHaveBeenCalledWith('item', 7, 'Chilli added'));
    expect(await within(box).findByTestId('signoff-words')).toHaveTextContent('Signed off by Aminath');
    expect(within(box).queryByTestId('signoff-button')).toBeNull();
  });

  it('words each state, and offers no sign-off to someone who cannot manage labels', async () => {
    expect(signoffWords({ ...changed, state: 'none', signed: null })).toBe('Not signed off yet');
    api.fetchLabelSignoff.mockResolvedValue({ data: { ...changed, state: 'none', signed: null, changed: [] }, lines: {} });
    render(<WordingSignoff kind="item" id={7} canManage={false} />);
    expect(await screen.findByText('Someone with Manage label settings signs the wording off.')).toBeInTheDocument();
    expect(screen.queryByTestId('signoff-button')).toBeNull();
  });
});

describe('WordingLockCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('locks the wording and lists every label with where it stands', async () => {
    api.fetchLabelSignoffs.mockResolvedValue({ data: [changed, { ...changed, id: 8, name: 'Masroshi', state: 'signed', changed: [] }], locked: false, lines: {} });
    api.saveLabelSettings.mockResolvedValue({ data: { label_wording_lock: '1' } });
    render(<WordingLockCard canManage />);
    expect(await screen.findByTestId('wording-lock-summary')).toHaveTextContent('1 of 2 labels need signing off.');
    const list = screen.getByTestId('wording-lock-list');
    expect(within(list).getByTestId('wording-row-item7')).toHaveTextContent('Changed');
    expect(within(list).getByTestId('wording-row-item8')).toHaveTextContent('Signed off');
    fireEvent.click(screen.getByRole('switch', { name: 'Lock the wording' }));
    await waitFor(() => expect(api.saveLabelSettings).toHaveBeenCalledWith({ label_wording_lock: '1' }));
    fireEvent.click(within(list).getByTestId('wording-row-item7'));
    expect(within(list).getByTestId('wording-signoff')).toBeInTheDocument();
  });
});
