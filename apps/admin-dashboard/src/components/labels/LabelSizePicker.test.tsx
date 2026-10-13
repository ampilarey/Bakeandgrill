import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LabelPreset, LabelRoll } from '../../api';
import { LabelSizePicker } from './LabelSizePicker';
import { DEFAULT_CHOICE, type SizeChoice } from './labelSize';

/*
 * The size picker with the rolls you own (round 6, 2026-10-13): the rolls
 * first, by name, and every other size under More sizes, folded while the
 * choice is one of the rolls.
 */
const rect = (id: string, w: number, h: number, design: LabelPreset['design'], perPage: number, extra: LabelPreset['options'] = []): LabelPreset => ({
  id, shape: 'rect', w, h, name: `${w} × ${h} mm`, cm: '', design,
  options: [
    { on: 'sheet', layout: id === 'r105x148' ? 'a4-4' : 'a4-custom', label: 'A4 sheet', per_page: perPage, landscape: false },
    ...extra,
    { on: 'printer', layout: id === 'r105x148' ? 'single-105x148' : 'single-custom', label: 'Label printer', per_page: 1, landscape: false },
  ],
});
const presets: LabelPreset[] = [
  rect('r105x148', 105, 148.5, 'full', 4, [{ on: 'precut', layout: 'a4-4-precut', label: 'Ready-cut A4 sheet', per_page: 4, landscape: false }]),
  rect('r60x40', 60, 40, 'small', 18),
  { id: 'c60', shape: 'circle', w: 60, h: 60, name: 'Round 60 mm', cm: '', design: 'round', options: [{ on: 'sheet', layout: 'a4-round-custom', label: 'A4 sheet', per_page: 12, landscape: false }, { on: 'printer', layout: 'single-round-custom', label: 'Label printer', per_page: 1, landscape: false }] },
];
const limits = { min_short: 20, min_long: 30, max_w: 210, max_h: 297, min_round: 30, max_round: 200, sheet_margin: 5 };
const rolls: LabelRoll[] = [
  { id: 'big', name: 'Big sheets', shape: 'rect', preset: 'r105x148', on: 'precut', w: 105, h: 148.5 },
  { id: 'small', name: 'Small roll', shape: 'rect', preset: 'custom', on: 'printer', w: 60, h: 40 },
  { id: 'lids', name: '', shape: 'circle', preset: 'c60', on: 'sheet', w: 60, h: 60 },
];

function Harness({ owned, start = DEFAULT_CHOICE }: { owned: LabelRoll[]; start?: SizeChoice }) {
  const [choice, setChoice] = useState<SizeChoice>(start);
  const [rounded, setRounded] = useState(false);
  return <LabelSizePicker presets={presets} limits={limits} choice={choice} onChange={setChoice} rounded={rounded} onRounded={setRounded} rolls={owned} />;
}

describe('LabelSizePicker', () => {
  it('shows every size plainly when no rolls are registered', () => {
    render(<Harness owned={[]} />);
    expect(screen.queryByRole('group', { name: 'My label rolls' })).toBeNull();
    expect(screen.queryByTestId('label-size-more')).toBeNull();
    expect(screen.getByRole('group', { name: 'Label size' })).toBeInTheDocument();
  });

  it('puts the rolls you own first and folds the rest under More sizes while one is picked', () => {
    render(<Harness owned={rolls} />);
    const mine = screen.getByRole('group', { name: 'My label rolls' });
    expect(within(mine).getAllByRole('button').map((b) => b.textContent)).toEqual(['Big sheets· 105 × 148.5', 'Small roll· 60 × 40', 'Round 60 mm']);
    // The default choice (105 × 148.5 on a plain A4 sheet) is none of the rolls: More sizes is open.
    expect(screen.getByTestId('label-size-more')).toHaveAttribute('open');
    expect(within(mine).getByRole('button', { name: /Big sheets/ })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(within(mine).getByRole('button', { name: /Small roll/ }));
    expect(within(mine).getByRole('button', { name: /Small roll/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('label-size-more')).not.toHaveAttribute('open');
    expect(screen.getByTestId('label-size-hint')).toHaveTextContent('Small roll · 60 × 40 mm (6 × 4 cm) · small sticker · one per label on a label printer.');

    // The same size on a sheet is not the roll; a roll on a preset keeps the preset's stock.
    fireEvent.click(within(mine).getByRole('button', { name: /Big sheets/ }));
    expect(screen.getByTestId('label-size-hint')).toHaveTextContent('Big sheets · 105 × 148.5 mm (10.5 × 14.85 cm) · full sticker · 4 on a ready-cut A4 sheet.');
    fireEvent.click(within(screen.getByRole('group', { name: 'Print on' })).getByRole('button', { name: /^A4 sheet/ }));
    expect(within(mine).getByRole('button', { name: /Big sheets/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('label-size-more')).toHaveAttribute('open');
    // A round roll without a name goes by its size.
    fireEvent.click(within(mine).getByRole('button', { name: 'Round 60 mm' }));
    expect(screen.getByTestId('label-size-hint')).toHaveTextContent('Round 60 mm · Round 60 mm (6 cm across) · round sticker · 12 on an A4 sheet');
  });

  // Label stock (round 13): a counted roll says what is left on its chip, in red once it is at its warning level.
  it('shows what is left on a counted roll', () => {
    render(<Harness owned={[{ ...rolls[1], left: 34, low: 50 }, { ...rolls[0], left: 12, low: 2 }, rolls[2]]} />);
    const mine = screen.getByRole('group', { name: 'My label rolls' });
    const chips = within(mine).getAllByRole('button');
    expect(chips.map((b) => b.textContent)).toEqual(['Small roll· 60 × 40 · 34 left', 'Big sheets· 105 × 148.5 · 12 left', 'Round 60 mm']);
    expect(chips[0]).toHaveAttribute('data-low', 'true');
    expect(chips[1]).not.toHaveAttribute('data-low');
    expect(chips[0]).toHaveAttribute('title', '60 × 40 mm · Label printer · 34 labels left');
  });
});
