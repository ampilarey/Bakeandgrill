import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const fetchLabelLayouts = vi.fn();
const fetchLabelProducts = vi.fn();
const stickerLinks = vi.fn();
const openLabelSheet = vi.fn();
const downloadLabelSheet = vi.fn();

vi.mock('../../api', () => ({
  fetchLabelLayouts: (...a: unknown[]) => fetchLabelLayouts(...a),
  fetchLabelTypes: () => Promise.resolve({ data: [] }),
  fetchLabelProducts: (...a: unknown[]) => fetchLabelProducts(...a),
  stickerLinks: (...a: unknown[]) => stickerLinks(...a),
  openLabelSheet: (...a: unknown[]) => openLabelSheet(...a),
  printsViaPdf: () => false,
  fetchLabelJob: vi.fn(),
  renameLabelJob: vi.fn(),
  downloadLabelSheet: (...a: unknown[]) => downloadLabelSheet(...a),
}));

import { StickerPrintPanel } from './StickerPrintPanel';

const product = (id: number, name: string, extra = {}) => ({
  id, name, name_dv: null, label_enabled: true, label_ingredients_source: 'manual', label_ingredients: 'Flour', label_ingredients_dv: null,
  label_shelf_life_days: 90, label_storage: 'frozen', label_pack_qty: null, label_title_media_id: null, label_title_url: null,
  label_photo_media_id: null, label_photo_url: null, cutout_url: null, allergens: [], has_recipe: false,
  label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null, label_note: null, label_note_dv: null, label_pack_unit: null,
  label_type_id: null, label_type_name: null, label_how_to_use: null, label_how_to_use_dv: null,
  defaults: { heading: 'FROZEN HEDHIKA', heading_dv: '', storage_line: 'KEEP FROZEN', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Bake & Grill', unit: 'PCS' },
  ingredients: { en: 'Flour', dv: '', from: 'manual', recipe_en: '', recipe_dv: '' }, ...extra,
});

describe('StickerPrintPanel', () => {
  beforeEach(() => {
    [fetchLabelLayouts, fetchLabelProducts, stickerLinks, openLabelSheet, downloadLabelSheet].forEach((f) => f.mockReset());
    try { localStorage.clear(); } catch { /* jsdom */ }
    fetchLabelLayouts.mockResolvedValue({ data: [
      { key: 'a4-4', label: '4 on A4', hint: 'Plain A4', per_page: 4, w: 105, h: 148.5, compact: false, shape: 'rect' },
      { key: 'a4-12', label: '12 on A4', hint: 'Compact', per_page: 12, w: 66, h: 72, compact: true, shape: 'rect' },
    ] });
    fetchLabelProducts.mockResolvedValue({ data: [product(1, 'Bajiya'), product(2, 'Patties', { label_shelf_life_days: null })] });
  });

  it('picks a sheet per product, says what will print, then prints and downloads', async () => {
    stickerLinks.mockResolvedValue({
      url: '/labels/stickers?print=1&signature=x', view_url: '/labels/stickers?signature=x', pdf_url: '/labels/stickers.pdf?signature=x', expires_in_minutes: 30,
      summary: { layout: 'a4-4', label: '4 on A4', design: 'full', stickers: 4, pages: 1, per_page: 4, products: [{ id: 1, name: 'Bajiya', copies: 4, mfg: '2026-10-04', exp: '2027-01-02', shelf_life_days: 90, ingredients_from: 'manual' }] },
    });
    render(<MemoryRouter><StickerPrintPanel /></MemoryRouter>);

    expect(await screen.findByText(/Keeps 90 days/)).toBeInTheDocument();
    expect(screen.getByText(/No shelf life set, dates print blank/)).toBeInTheDocument();
    expect(screen.getByTestId('sticker-prepare')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Print Bajiya'));
    expect(screen.getByLabelText('How many Bajiya stickers')).toHaveValue(4);
    // − and + move a whole sheet; a typed count snaps to the next sheet.
    fireEvent.click(screen.getByLabelText('How many Bajiya stickers: more'));
    expect(screen.getByLabelText('How many Bajiya stickers')).toHaveValue(8);
    fireEvent.change(screen.getByLabelText('How many Bajiya stickers'), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('How many Bajiya stickers: fewer'));
    expect(screen.getByLabelText('How many Bajiya stickers')).toHaveValue(4);
    fireEvent.click(screen.getByText('Fill in the dates'));
    fireEvent.click(screen.getByTestId('sticker-prepare'));

    await waitFor(() => expect(stickerLinks).toHaveBeenCalled());
    expect(stickerLinks.mock.calls[0][0]).toMatchObject({ items: [{ id: 1, copies: 4 }], lang: 'en', layout: 'a4-4', fill: true, rounded: false });
    const summary = await screen.findByTestId('sticker-summary');
    expect(summary).toHaveTextContent('4 stickers on 1 page');
    expect(summary).toHaveTextContent('EXP 2027-01-02');

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(openLabelSheet).toHaveBeenCalledWith('/labels/stickers?print=1&signature=x', '/labels/stickers.pdf?signature=x');
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(downloadLabelSheet).toHaveBeenCalledWith('/labels/stickers.pdf?signature=x');
  });

  it('shows the server\'s reason when a sheet is refused', async () => {
    stickerLinks.mockRejectedValue(new Error('The expiry date has already passed.'));
    render(<MemoryRouter><StickerPrintPanel fixedItems={[{ id: 1, name: 'Bajiya' }]} productionItemId={9} defaults={{ batch: 'KP-77', exp: '2020-01-01', fill: true }} /></MemoryRouter>);
    await waitFor(() => expect(fetchLabelLayouts).toHaveBeenCalled());
    // A production line prints its own item: no product chooser.
    expect(fetchLabelProducts).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('sticker-prepare'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The expiry date has already passed.');
    expect(stickerLinks.mock.calls[0][0]).toMatchObject({ pi: 9, batch: 'KP-77', exp: '2020-01-01', items: [{ id: 1, copies: 4 }] });
  });

  it('lets a production line print more than one sheet', async () => {
    stickerLinks.mockRejectedValue(new Error('x'));
    render(<MemoryRouter><StickerPrintPanel fixedItems={[{ id: 1, name: 'Bajiya' }]} productionItemId={9} /></MemoryRouter>);
    await waitFor(() => expect(fetchLabelLayouts).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText('How many Bajiya stickers: more'));
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(stickerLinks).toHaveBeenCalled());
    expect(stickerLinks.mock.calls[0][0]).toMatchObject({ items: [{ id: 1, copies: 8 }] });
  });
});
