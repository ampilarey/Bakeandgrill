/**
 * Owner, 2026-11-14: "Still i feel saving, printing ect of labels are confusing"; "It should be dated before
 * printing". Print on a label's row opens one pop-up: how many, the made-on date and the use-by, the paper, and
 * the label drawn with them. Nothing prints until Print is pressed, and there is no Prepare step.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../ui';

const stickerLinks = vi.fn();
const fetchLabelLayouts = vi.fn();
const openLabelSheet = vi.fn();
const downloadLabelSheet = vi.fn();

vi.mock('../../api', () => ({
  stickerLinks: (...a: unknown[]) => stickerLinks(...a),
  fetchLabelLayouts: (...a: unknown[]) => fetchLabelLayouts(...a),
  openLabelSheet: (...a: unknown[]) => openLabelSheet(...a),
  downloadLabelSheet: (...a: unknown[]) => downloadLabelSheet(...a),
  signOffLabel: vi.fn(),
  fetchLabelSignoff: vi.fn(),
}));

import { PrintLabelModal, type PrintTarget } from './PrintLabelModal';

const preset = (id: string, w: number, h: number, perPage: number) => ({
  id, shape: 'rect' as const, w, h, name: `${w} × ${h} mm`, cm: '', design: 'full',
  options: [{ on: 'sheet', layout: 'a4-custom', label: 'A4 sheet', per_page: perPage, landscape: false }],
});
const LAYOUTS = { data: [], presets: [preset('r105x148', 105, 148, 4), preset('r140x62', 140, 62, 4), preset('r40x60', 40, 60, 16)], limits: { min_w: 30, min_h: 20, max_w: 297, max_h: 210 }, rolls: [], badges: [] };
const momo: PrintTarget = { kind: 'custom', id: 7, name: 'Chicken Momo', lang: 'en', pouch: true };
const summary = (extra = {}) => ({ design: 'pouch', w: 140, h: 62, products: [{ id: 7, name: 'Chicken Momo', copies: 1, mfg: '2026-11-14', exp: '2026-12-14', shelf_life_days: 30, ingredients_from: 'typed' }], dropped: [], ...extra });
const show = (target = momo) => render(<MemoryRouter><ToastProvider><PrintLabelModal target={target} onClose={() => {}} /></ToastProvider></MemoryRouter>);
const lastBody = () => stickerLinks.mock.calls[stickerLinks.mock.calls.length - 1][0] as Record<string, unknown>;
const previewed = async () => { await waitFor(() => expect(stickerLinks).toHaveBeenCalled(), { timeout: 3000 }); await act(async () => { await Promise.resolve(); }); };

describe('PrintLabelModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchLabelLayouts.mockResolvedValue(LAYOUTS);
    stickerLinks.mockResolvedValue({ url: '/labels/stickers?s=1', one_url: '/labels/stickers?one=1', view_url: '/v', pdf_url: '/x.pdf', expires_in_minutes: 30, summary: summary() });
  });

  it('opens a pouch label at its own size, draws it with the dates, and prints only on Print', async () => {
    show();
    expect(await screen.findByTestId('print-paper')).toHaveTextContent('140 × 62 mm');
    await previewed();
    // Only a preview so far, with today's made-on date filled in.
    expect(lastBody().preview).toBe(true);
    expect(lastBody().fill).toBe(true);
    expect(String(lastBody().mfg)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(openLabelSheet).not.toHaveBeenCalled();
    expect(await screen.findByTestId('make-use-by')).toHaveTextContent('Use by');

    // A sheet's worth to start with; the button says how many.
    const go = await screen.findByTestId('print-go');
    await waitFor(() => expect(go).toHaveTextContent('Print 4'));
    fireEvent.click(go);
    await waitFor(() => expect(openLabelSheet).toHaveBeenCalledWith('/labels/stickers?s=1', '/x.pdf'));
    const body = lastBody();
    expect(body.preview).toBeUndefined();
    expect(body.items).toEqual([{ id: 7, copies: 4, kind: 'custom' }]);
    expect(await screen.findByTestId('print-done')).toBeInTheDocument();
    // The size is kept for this label's next print.
    expect(JSON.parse(localStorage.getItem('labels.sizeFor') ?? '{}').c7.preset).toBe('r140x62');
  });

  it('a months chip sets the use-by before printing, and a use-by already past keeps Print off', async () => {
    show();
    await previewed();
    fireEvent.change(screen.getByTestId('print-mfg'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: '2 months' }));
    expect((screen.getByTestId('print-exp') as HTMLInputElement).value).toBe('2027-01-01');
    await waitFor(() => expect(lastBody().exp).toBe('2027-01-01'), { timeout: 3000 });

    fireEvent.change(screen.getByTestId('print-exp'), { target: { value: '2020-01-01' } });
    expect(await screen.findByText('That use-by date has already passed.')).toBeInTheDocument();
    expect(screen.getByTestId('print-go')).toBeDisabled();
  });

  it('a batch number typed in plain view goes on the print', async () => {
    show();
    await previewed();
    fireEvent.change(screen.getByTestId('print-batch'), { target: { value: 'B-1411' } });
    await waitFor(() => expect(lastBody().batch).toBe('B-1411'), { timeout: 3000 });
    fireEvent.click(screen.getByTestId('print-go'));
    await waitFor(() => expect(openLabelSheet).toHaveBeenCalled());
    expect(lastBody().batch).toBe('B-1411');
    expect(lastBody().preview).toBeUndefined();
  });

  it('opens at the size this label printed at last time, not the size of whatever printed last', async () => {
    localStorage.setItem('labels.lastSize', JSON.stringify({ shape: 'rect', preset: 'r105x148', on: 'sheet', w: 105, h: 148 }));
    localStorage.setItem('labels.sizeFor', JSON.stringify({ c9: { shape: 'rect', preset: 'r40x60', on: 'sheet', w: 40, h: 60, roll: null } }));
    show({ kind: 'custom', id: 9, name: 'Garlic Sauce', lang: 'en' });
    expect(await screen.findByTestId('print-paper')).toHaveTextContent('40 × 60 mm');
  });

  it('keeps Print off while the wording lock refuses the label', async () => {
    stickerLinks.mockResolvedValue({ url: '/u', one_url: '/o', view_url: '/v', pdf_url: '/x.pdf', expires_in_minutes: 30, summary: summary({ wording: { refused: [{ key: 'c7', name: 'Chicken Momo' }], message: 'Chicken Momo: the wording changed since it was signed off.' } }) });
    show();
    await previewed();
    await waitFor(() => expect(screen.getByTestId('print-go')).toBeDisabled());
  });
});
