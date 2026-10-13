import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelPreset } from '../../api';

/*
 * Make a label in four steps (owner, 2026-10-13): a menu item not yet on
 * labels is switched on when picked; a picture card picks the size; the
 * preview draws from the same sticker request Pack stickers makes; Print
 * prepares the sheet with the copies asked for and opens it.
 */
const api = vi.hoisted(() => ({
  fetchLabelLayouts: vi.fn(),
  fetchLabelProducts: vi.fn(),
  fetchCustomLabels: vi.fn(),
  stickerLinks: vi.fn(),
  updateItemLabel: vi.fn(),
  openLabelSheet: vi.fn(),
  downloadLabelSheet: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('./CustomLabels', () => ({ CustomLabelModal: () => null, langOf: () => 'en' }));
vi.mock('./ItemLabelTab', () => ({ ItemLabelTab: () => null }));
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { MakeLabelWizard } from './MakeLabelWizard';

const rect = (id: string, w: number, h: number, design: LabelPreset['design'], perPage: number): LabelPreset => ({
  id, shape: 'rect', w, h, name: `${w} × ${h} mm`, cm: '', design,
  options: [
    { on: 'sheet', layout: id === 'r105x148' ? 'a4-4' : 'a4-custom', label: 'A4 sheet', per_page: perPage, landscape: false },
    { on: 'printer', layout: id === 'r105x148' ? 'single-105x148' : 'single-custom', label: 'Label printer', per_page: 1, landscape: false },
  ],
});
const presets: LabelPreset[] = [
  rect('r105x148', 105, 148.5, 'full', 4),
  rect('r99x70', 99, 70.5, 'mini', 8),
  rect('r60x40', 60, 40, 'small', 18),
  rect('r40x30', 40, 30, 'small', 35),
  { id: 'c60', shape: 'circle', w: 60, h: 60, name: 'Round 60 mm', cm: '', design: 'round', options: [{ on: 'sheet', layout: 'a4-round-custom', label: 'A4 sheet', per_page: 12, landscape: false }, { on: 'printer', layout: 'single-round-custom', label: 'Label printer', per_page: 1, landscape: false }] },
  rect('r180x40', 180, 40, 'wrap', 7),
];
const limits = { min_short: 20, min_long: 30, max_w: 210, max_h: 297, min_round: 30, max_round: 200, sheet_margin: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.fetchLabelLayouts.mockResolvedValue({ data: [], presets, limits, wrap: { parts: [], marks: [], default_parts: [], default_marks: [], max_pictures: 4 } });
  api.fetchLabelProducts.mockResolvedValue({ data: [
    { id: 7, name: 'Bajiya', name_dv: 'ބަޖިޔާ', label_enabled: false },
    { id: 8, name: 'Masroshi', name_dv: null, label_enabled: true },
  ] });
  api.fetchCustomLabels.mockResolvedValue({ data: [] });
  api.updateItemLabel.mockResolvedValue({ data: { id: 7, label_enabled: true } });
  api.stickerLinks.mockImplementation(async (body: { preview?: boolean }) => ({
    url: body.preview ? '/labels/stickers?preview=1&signature=p' : '/labels/stickers?print=1&signature=x',
    one_url: body.preview ? '/labels/stickers?preview=1&one=1&signature=p' : null,
    view_url: '/labels/stickers?signature=x', pdf_url: '/labels/stickers.pdf?signature=x', expires_in_minutes: 30,
    job: body.preview ? undefined : { id: 3, name: 'Bajiya · 60 × 40 mm' },
    summary: { layout: 'a4-custom', label: '', design: 'small', stickers: 18, pages: 1, per_page: 18, products: [] },
  }));
});

function mount() {
  return render(<MemoryRouter><MakeLabelWizard /></MemoryRouter>);
}

describe('MakeLabelWizard', () => {
  it('walks from a menu item to a printed sheet, switching the item on for labels on the way', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    const row = await screen.findByRole('button', { name: /Bajiya/ });
    expect(row).toHaveTextContent('Not on labels yet');
    fireEvent.click(row);
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenCalledWith(7, { label_enabled: true }));

    // Step 2: the picture cards, with their sizes.
    const cards = await screen.findByRole('group', { name: 'Which label' });
    expect(within(cards).getByRole('button', { name: /Jar or tub/ })).toHaveTextContent('60 × 40 mm');
    expect(within(cards).getByRole('button', { name: /Round lid/ })).toHaveTextContent('Ø 60 mm');
    expect(within(cards).getByRole('button', { name: /Bottle wrap/ })).toHaveTextContent('180 × 40 mm');
    fireEvent.click(within(cards).getByRole('button', { name: /Jar or tub/ }));
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('60 × 40 mm · small sticker · 18 on A4 sheet');
    fireEvent.click(screen.getByTestId('make-next-2'));

    // Step 3: the preview is drawn from the same request Pack stickers makes, in both languages for a Dhivehi name.
    await waitFor(() => expect(api.stickerLinks).toHaveBeenCalled());
    expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ items: [{ id: 7, copies: 1, kind: 'item' }], layout: 'a4-custom', w: 60, h: 40, lang: 'both', fill: true, preview: true }));
    await waitFor(() => expect(screen.getByTitle('The label')).toHaveAttribute('src', expect.stringContaining('one=1')));
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en', preview: true })));
    fireEvent.click(screen.getByTestId('make-next-3'));

    // Step 4: a sheet's worth to start with, then Print prepares and opens it.
    expect(screen.getByRole('spinbutton', { name: 'Labels' })).toHaveValue(18);
    fireEvent.click(screen.getByTestId('make-print'));
    await waitFor(() => expect(api.openLabelSheet).toHaveBeenCalledWith('/labels/stickers?print=1&signature=x', '/labels/stickers.pdf?signature=x'));
    expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ items: [{ id: 7, copies: 18, kind: 'item' }], layout: 'a4-custom', lang: 'en' }));
    expect(api.stickerLinks.mock.calls[api.stickerLinks.mock.calls.length - 1]?.[0]).not.toHaveProperty('preview', true);
    expect(screen.getByTestId('make-done')).toHaveTextContent('Saved as "Bajiya · 60 × 40 mm" under Saved labels');
    expect(JSON.parse(window.localStorage.getItem('labels.lastSize') ?? '{}')).toMatchObject({ preset: 'r60x40' });
  });

  it('offers a size of your own and a label printer, and starts over', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /A menu item/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Masroshi/ }));
    expect(api.updateItemLabel).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /My own size/ }));
    expect(screen.getByTestId('make-own-size')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('make-own-size')).getByRole('button', { name: 'Round' }));
    fireEvent.click(within(screen.getByTestId('make-own-size')).getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Across (mm)'), { target: { value: '45' } });
    expect(screen.getByTestId('make-size-line')).toHaveTextContent('Round 45 mm · round sticker');
    fireEvent.click(screen.getByTestId('make-next-2'));
    fireEvent.click(screen.getByTestId('make-next-3'));
    fireEvent.click(screen.getByRole('button', { name: 'Label printer' }));
    expect(screen.getByRole('spinbutton', { name: 'Labels' })).toHaveValue(1);
    fireEvent.click(screen.getByTestId('make-pdf'));
    await waitFor(() => expect(api.downloadLabelSheet).toHaveBeenCalledWith('/labels/stickers.pdf?signature=x'));
    expect(api.stickerLinks).toHaveBeenLastCalledWith(expect.objectContaining({ layout: 'single-round-custom', w: 45, h: null, items: [{ id: 8, copies: 1, kind: 'item' }] }));
    fireEvent.click(screen.getByTestId('make-again'));
    expect(screen.getByTestId('make-step-1')).toBeInTheDocument();
  });
});
