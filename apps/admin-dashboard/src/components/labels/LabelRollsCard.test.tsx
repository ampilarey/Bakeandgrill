import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelPreset } from '../../api';

/*
 * My label rolls under Settings (round 6, 2026-10-13): the rolls you own,
 * added with the size picker, renamed in place, removed after asking; kept
 * as the one setting `label_rolls`.
 */
const api = vi.hoisted(() => ({ fetchLabelLayouts: vi.fn(), saveLabelSettings: vi.fn(), fetchLabelSettings: vi.fn() }));
vi.mock('../../api', () => api);
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { LabelRollsCard } from './LabelRollsCard';

const presets: LabelPreset[] = [
  { id: 'r105x148', shape: 'rect', w: 105, h: 148.5, name: '105 × 148.5 mm', cm: '', design: 'full', options: [{ on: 'sheet', layout: 'a4-4', label: 'A4 sheet', per_page: 4, landscape: false }, { on: 'printer', layout: 'single-105x148', label: 'Label printer', per_page: 1, landscape: false }] },
  { id: 'r60x40', shape: 'rect', w: 60, h: 40, name: '60 × 40 mm', cm: '', design: 'small', options: [{ on: 'sheet', layout: 'a4-custom', label: 'A4 sheet', per_page: 18, landscape: false }, { on: 'printer', layout: 'single-custom', label: 'Label printer', per_page: 1, landscape: false }] },
];
const limits = { min_short: 20, min_long: 30, max_w: 210, max_h: 297, min_round: 30, max_round: 200, sheet_margin: 5 };
const owned = [{ id: 'small', name: 'Small roll', shape: 'rect', preset: 'r60x40', on: 'printer', w: 60, h: 40 }];

describe('LabelRollsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchLabelLayouts.mockResolvedValue({ data: [], presets, limits, rolls: owned });
    api.fetchLabelSettings.mockResolvedValue({ data: { label_rolls: JSON.stringify(owned), label_kitchen_roll: '', label_kitchen_lang: 'en' }, defaults: {} });
    // The server answers with every setting as stored, so a save keeps what earlier saves set.
    const stored: Record<string, string> = { label_rolls: JSON.stringify(owned), label_kitchen_roll: '', label_kitchen_lang: 'en' };
    api.saveLabelSettings.mockImplementation(async (body: Record<string, string>) => ({ data: Object.assign(stored, body) }));
  });

  // Print when packing (round 12): the roll and language the kitchen screen prints a batch's stickers with.
  it('picks the roll and language the kitchen screen prints with', async () => {
    render(<LabelRollsCard canManage />);
    const setup = await screen.findByTestId('label-kitchen-setup');
    const roll = within(setup).getByLabelText('Prints on') as HTMLSelectElement;
    expect(roll).toHaveValue('');
    expect(within(roll).getByRole('option', { name: /Small roll · 60 × 40 mm · Label printer/ })).toBeInTheDocument();
    fireEvent.change(roll, { target: { value: 'small' } });
    await waitFor(() => expect(api.saveLabelSettings).toHaveBeenCalledWith({ label_kitchen_roll: 'small' }));
    fireEvent.change(within(setup).getByLabelText('In'), { target: { value: 'both' } });
    await waitFor(() => expect(api.saveLabelSettings).toHaveBeenCalledWith({ label_kitchen_lang: 'both' }));
    await waitFor(() => expect(within(setup).getByLabelText('In')).toHaveValue('both'));
    expect(roll).toHaveValue('small');
  });

  it('shows the kitchen picks locked to someone who cannot manage labels', async () => {
    render(<LabelRollsCard canManage={false} />);
    const setup = await screen.findByTestId('label-kitchen-setup');
    expect(within(setup).getByLabelText('Prints on')).toBeDisabled();
    expect(within(setup).getByLabelText('In')).toBeDisabled();
  });

  it('lists the rolls, adds one with the size picker, and removes one after asking', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LabelRollsCard canManage />);
    const list = await screen.findByTestId('label-rolls');
    expect(list).toHaveTextContent('Small roll');
    expect(list).toHaveTextContent('60 × 40 mm · Label printer');

    fireEvent.click(screen.getByTestId('label-roll-new'));
    const form = screen.getByTestId('label-roll-form');
    fireEvent.change(within(form).getByLabelText('Name (optional)'), { target: { value: 'Big sheets' } });
    // The picker inside the form shows every size (it is how a roll is described).
    expect(within(form).queryByTestId('label-size-more')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: '105 × 148.5' }));
    fireEvent.click(screen.getByTestId('label-roll-save'));
    await waitFor(() => expect(api.saveLabelSettings).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(api.saveLabelSettings.mock.calls[0][0].label_rolls as string) as { id: string; name: string; preset: string; on: string }[];
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ name: 'Big sheets', shape: 'rect', preset: 'r105x148', on: 'sheet', w: 105, h: 148.5 });
    expect(saved[1].id).toMatch(/^roll-/);
    await waitFor(() => expect(screen.getByTestId('label-rolls')).toHaveTextContent('Big sheets'));
    expect(screen.queryByTestId('label-roll-form')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Small roll' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remove Small roll from your rolls?'));
    await waitFor(() => expect(api.saveLabelSettings).toHaveBeenCalledTimes(2));
    expect(JSON.parse(api.saveLabelSettings.mock.calls[1][0].label_rolls as string)).toHaveLength(1);
    confirm.mockRestore();
  });

  it('only shows the rolls to someone who cannot manage labels', async () => {
    render(<LabelRollsCard canManage={false} />);
    expect(await screen.findByTestId('label-rolls')).toHaveTextContent('Small roll');
    expect(screen.queryByTestId('label-roll-new')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Small roll' })).toBeNull();
  });
});
