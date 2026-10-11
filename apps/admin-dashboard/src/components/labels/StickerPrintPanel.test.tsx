import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const fetchLabelLayouts = vi.fn();
const fetchLabelProducts = vi.fn();
const fetchCustomLabels = vi.fn();
const stickerLinks = vi.fn();
const openLabelSheet = vi.fn();
const downloadLabelSheet = vi.fn();
const canManage = { value: false };

vi.mock('../../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ user: null, loading: false, can: (slug?: string) => slug !== 'labels.manage' || canManage.value }),
}));

vi.mock('./CustomLabels', () => ({
  CustomLabelModal: () => <div data-testid="custom-label-modal" />,
}));

vi.mock('../../api', () => ({
  fetchLabelLayouts: (...a: unknown[]) => fetchLabelLayouts(...a),
  fetchLabelTypes: () => Promise.resolve({ data: [] }),
  fetchLabelProducts: (...a: unknown[]) => fetchLabelProducts(...a),
  fetchCustomLabels: (...a: unknown[]) => fetchCustomLabels(...a),
  stickerLinks: (...a: unknown[]) => stickerLinks(...a),
  openLabelSheet: (...a: unknown[]) => openLabelSheet(...a),
  printsViaPdf: () => false,
  fetchLabelJob: vi.fn(),
  renameLabelJob: vi.fn(),
  downloadLabelSheet: (...a: unknown[]) => downloadLabelSheet(...a),
}));

import { StickerPrintPanel } from './StickerPrintPanel';

/** The prepare call (the live preview calls the same API with preview: true). */
const prepared = () => stickerLinks.mock.calls.map((c) => c[0] as Record<string, unknown>).find((b) => !b.preview);
const previews = () => stickerLinks.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((b) => b.preview);

const product = (id: number, name: string, extra = {}) => ({
  id, name, name_dv: null, label_enabled: true, label_ingredients_source: 'manual', label_ingredients: 'Flour', label_ingredients_dv: null,
  label_shelf_life_days: 90, label_storage: 'frozen', label_pack_qty: null, label_title_media_id: null, label_title_url: null,
  label_photo_media_id: null, label_photo_url: null, cutout_url: null, allergens: [], has_recipe: false,
  label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null, label_note: null, label_note_dv: null, label_pack_unit: null,
  label_type_id: null, label_type_name: null, label_how_to_use: null, label_how_to_use_dv: null,
  defaults: { heading: 'FROZEN HEDHIKA', heading_dv: '', storage_line: 'KEEP FROZEN', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Bake & Grill', unit: 'PCS' },
  ingredients: { en: 'Flour', dv: '', from: 'manual', recipe_en: '', recipe_dv: '' }, ...extra,
});

const custom = (id: number, name: string, extra = {}) => ({
  id, kind: 'custom', name, name_dv: null, brand_id: 2, brand_name: 'Amma', brand_logo_url: null, label_type_id: null, label_type_name: null,
  label_storage: null, storage: 'chilled', label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null,
  label_ingredients: 'Garlic, oil', label_ingredients_dv: null, label_how_to_use: null, label_how_to_use_dv: null, label_note: null, label_note_dv: null,
  label_shelf_life_days: 14, label_pack_qty: null, label_pack_unit: null, label_photo_media_id: null, label_photo_url: null, label_title_media_id: null, label_title_url: null,
  defaults: { heading: 'CHILLED', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Amma', unit: 'PCS' },
  ingredients: { en: 'Garlic, oil', dv: '', from: 'manual' }, created_by: null, updated_at: null, ...extra,
});

const preset = (id: string, shape: 'rect' | 'circle', w: number, h: number, design: string, options: [string, string, string, number][]) => ({
  id, shape, w, h, name: shape === 'circle' ? `Round ${w} mm` : `${w} × ${h} mm`, cm: shape === 'circle' ? `${w / 10} cm across` : `${w / 10} × ${h / 10} cm`, design,
  options: options.map(([on, layout, label, per_page]) => ({ on, layout, label, per_page, landscape: layout === 'a4-custom' })),
});

const PRESETS = [
  preset('r105x148', 'rect', 105, 148.5, 'full', [['sheet', 'a4-4', 'A4 sheet', 4], ['precut', 'a4-4-precut', 'Ready-cut A4 sheet', 4], ['printer', 'single-105x148', 'Label printer', 1]]),
  preset('r66x72', 'rect', 66, 72, 'mini', [['sheet', 'a4-12', 'A4 sheet', 12], ['printer', 'single-custom', 'Label printer', 1]]),
  preset('r40x60', 'rect', 40, 60, 'small', [['sheet', 'a4-custom', 'A4 sheet', 21], ['printer', 'single-custom', 'Label printer', 1]]),
  preset('c60', 'circle', 60, 60, 'round', [['sheet', 'a4-round-custom', 'A4 sheet', 12], ['printer', 'single-round-custom', 'Label printer', 1]]),
];

describe('StickerPrintPanel', () => {
  beforeEach(() => {
    [fetchLabelLayouts, fetchLabelProducts, fetchCustomLabels, stickerLinks, openLabelSheet, downloadLabelSheet].forEach((f) => f.mockReset());
    canManage.value = false;
    try { localStorage.clear(); } catch { /* jsdom */ }
    fetchLabelLayouts.mockResolvedValue({
      data: [
        { key: 'a4-4', label: '4 on A4', hint: 'Plain A4', per_page: 4, w: 105, h: 148.5, page_w: 210, page_h: 297, compact: false, shape: 'rect' },
        { key: 'a4-12', label: '12 on A4', hint: 'Compact', per_page: 12, w: 66, h: 72, page_w: 210, page_h: 297, compact: true, shape: 'rect' },
      ],
      presets: PRESETS,
      limits: { min_short: 20, min_long: 30, max_w: 210, max_h: 297, min_round: 30, max_round: 200, sheet_margin: 5 },
    });
    fetchLabelProducts.mockResolvedValue({ data: [product(1, 'Bajiya'), product(2, 'Patties', { label_shelf_life_days: null })] });
    fetchCustomLabels.mockResolvedValue({ data: [] });
  });

  it('picks a sheet per product, says what will print, then prints and downloads', async () => {
    stickerLinks.mockResolvedValue({
      url: '/labels/stickers?print=1&signature=x', view_url: '/labels/stickers?signature=x', pdf_url: '/labels/stickers.pdf?signature=x', expires_in_minutes: 30,
      summary: { layout: 'a4-4', label: '4 on A4', design: 'full', stickers: 4, pages: 1, per_page: 4, products: [{ id: 1, name: 'Bajiya', copies: 4, mfg: '2026-10-04', exp: '2027-01-02', shelf_life_days: 90, ingredients_from: 'manual' }] },
    });
    render(<MemoryRouter><StickerPrintPanel /></MemoryRouter>);

    expect(await screen.findByText(/Keeps 90 days/)).toBeInTheDocument();
    await screen.findByTestId('label-size-picker');
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

    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ items: [{ id: 1, copies: 4 }], lang: 'en', layout: 'a4-4', fill: true, rounded: false });
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
    // Prepare waits for the sizes and the line's first sheet.
    await waitFor(() => expect(screen.getByTestId('sticker-prepare')).toBeEnabled());
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ pi: 9, batch: 'KP-77', exp: '2020-01-01', items: [{ id: 1, copies: 4 }] });
    expect(await screen.findByRole('alert')).toHaveTextContent('The expiry date has already passed.');
  });

  it('lets a production line print more than one sheet', async () => {
    stickerLinks.mockRejectedValue(new Error('x'));
    const { rerender } = render(<MemoryRouter><StickerPrintPanel fixedItems={[{ id: 1, name: 'Bajiya' }]} productionItemId={9} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('sticker-prepare')).toBeEnabled());
    fireEvent.click(await screen.findByLabelText('How many Bajiya stickers: more'));
    // The modal around it passes a new list on each render; the count stays.
    rerender(<MemoryRouter><StickerPrintPanel fixedItems={[{ id: 1, name: 'Bajiya' }]} productionItemId={9} /></MemoryRouter>);
    expect(screen.getByLabelText('How many Bajiya stickers')).toHaveValue(8);
    expect(fetchLabelLayouts).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ items: [{ id: 1, copies: 8 }] });
  });

  it('draws a live preview of one sticker or the sheet, for the chosen product, as the form changes', async () => {
    stickerLinks.mockResolvedValue({
      url: '/labels/stickers?preview=1&signature=p', one_url: '/labels/stickers?preview=1&one=1&signature=p', view_url: '/labels/stickers?signature=p', pdf_url: '/labels/stickers.pdf?signature=p', expires_in_minutes: 30,
      summary: { layout: 'a4-4', label: '4 on A4', design: 'full', stickers: 8, pages: 2, per_page: 4, products: [] },
    });
    render(<MemoryRouter><StickerPrintPanel /></MemoryRouter>);
    await screen.findByText(/Keeps 90 days/);
    await screen.findByTestId('label-size-picker');
    // Nothing picked: no request, a hint in the frame.
    expect(screen.getByTestId('sheet-preview')).toHaveTextContent('Pick a product');
    expect(screen.queryByTitle('Sticker preview')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Print Bajiya'));
    fireEvent.click(screen.getByLabelText('Print Patties'));
    await waitFor(() => expect(previews().length).toBeGreaterThan(0), { timeout: 2000 });
    // One request for the two clicks (half a second apart they collapse), the picked product first.
    expect(previews()[0]).toMatchObject({ preview: true, items: [{ id: 1, copies: 4 }, { id: 2, copies: 4 }] });
    const frame = await screen.findByTitle('Sticker preview');
    expect(frame).toHaveAttribute('src', expect.stringContaining('one=1'));
    expect(screen.getByTestId('sticker-preview-pane')).toHaveTextContent('Bajiya · English · 105 × 148.5 mm · 4 on A4');

    // Another product in front, then the whole sheet.
    fireEvent.change(screen.getByLabelText('Product to preview'), { target: { value: 'i2' } });
    await waitFor(() => expect(previews().length).toBe(2), { timeout: 2000 });
    expect(previews()[1]).toMatchObject({ items: [{ id: 2, copies: 4 }, { id: 1, copies: 4 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Sheet' }));
    expect(screen.getByTitle('Sheet preview')).toHaveAttribute('src', expect.not.stringContaining('one=1'));
    expect(screen.getByTestId('sticker-preview-pane')).toHaveTextContent('Page 1 of 2 · 8 stickers');

    // A refused request shows its reason by the preview, not as the page's error.
    stickerLinks.mockRejectedValue(new Error('The expiry date has already passed.'));
    fireEvent.click(screen.getByText('Fill in the dates'));
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '2020-01-01' } });
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('The expiry date has already passed.');
  });

  it('prints the owner\'s 4 × 6 cm on a label printer and on A4, and a 6 cm circle', async () => {
    stickerLinks.mockRejectedValue(new Error('x'));
    render(<MemoryRouter><StickerPrintPanel /></MemoryRouter>);
    await screen.findByTestId('label-size-picker');
    fireEvent.click(screen.getByLabelText('Print Bajiya'));

    fireEvent.click(screen.getByRole('button', { name: '40 × 60' }));
    // A4 is the stock by default: 21 to a sheet, which is also what − and + step by.
    expect(screen.getByRole('button', { name: /A4 sheet/ })).toHaveTextContent('21');
    expect(screen.getByTestId('label-size-hint')).toHaveTextContent('40 × 60 mm (4 × 6 cm) · small sticker · 21 on a landscape A4 sheet');
    fireEvent.click(screen.getByRole('button', { name: 'Label printer' }));
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ layout: 'single-custom', w: 40, h: 60, rounded: false });

    stickerLinks.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Round' }));
    expect(screen.getByRole('button', { name: 'Ø 60' })).toHaveAttribute('aria-pressed', 'true');
    // Round has no rounded-corners box; the label printer stays chosen.
    expect(screen.queryByText('Rounded corners')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /A4 sheet/ }));
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ layout: 'a4-round-custom', w: 60, h: null });
  });

  it('takes a size typed in, swaps it, and refuses one too small before asking', async () => {
    stickerLinks.mockRejectedValue(new Error('x'));
    render(<MemoryRouter><StickerPrintPanel /></MemoryRouter>);
    await screen.findByTestId('label-size-picker');
    fireEvent.click(screen.getByLabelText('Print Bajiya'));
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Height (mm)'), { target: { value: '35' } });
    fireEvent.click(screen.getByLabelText('Swap width and height'));
    expect(screen.getByLabelText('Width (mm)')).toHaveValue(35);
    expect(screen.getByLabelText('Height (mm)')).toHaveValue(45);
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ layout: 'a4-custom', w: 35, h: 45 });

    fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '15' } });
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Labels can be from 30 × 20 mm');
    expect(screen.getByTestId('sticker-prepare')).toBeDisabled();
  });

  it('lists custom labels beside the menu and sends them as custom', async () => {
    stickerLinks.mockRejectedValue(new Error('x'));
    fetchCustomLabels.mockResolvedValue({ data: [custom(1, 'Garlic Sauce')] });
    canManage.value = true;
    render(<MemoryRouter><StickerPrintPanel /></MemoryRouter>);
    await screen.findByText('Garlic Sauce');
    await screen.findByTestId('label-size-picker');
    expect(screen.getByText('Garlic Sauce').parentElement).toHaveTextContent('Custom');
    expect(screen.getByText(/Amma · Keeps 14 days/)).toBeInTheDocument();

    // Menu item 1 and custom label 1 are two products.
    fireEvent.click(screen.getByLabelText('Print Bajiya'));
    fireEvent.click(screen.getByLabelText('Print Garlic Sauce'));
    fireEvent.click(screen.getByTestId('sticker-prepare'));
    await waitFor(() => expect(prepared()).toBeTruthy());
    expect(prepared()).toMatchObject({ items: [{ id: 1, copies: 4, kind: 'item' }, { id: 1, copies: 4, kind: 'custom' }] });

    fireEvent.click(screen.getByRole('button', { name: /Custom labels \(1\)/ }));
    expect(screen.queryByLabelText('Print Patties')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sticker-new-custom'));
    expect(screen.getByTestId('custom-label-modal')).toBeInTheDocument();
  });

  it('opens with a custom label picked from the Custom labels tab', async () => {
    stickerLinks.mockRejectedValue(new Error('x'));
    fetchCustomLabels.mockResolvedValue({ data: [custom(7, 'Gift box')] });
    render(<MemoryRouter initialEntries={['/labels/stickers?custom=7']}><StickerPrintPanel /></MemoryRouter>);
    await screen.findByText('Gift box');
    await waitFor(() => expect(screen.getByLabelText('Print Gift box')).toBeChecked());
    // Without Manage label settings there is no "New custom label".
    expect(screen.queryByTestId('sticker-new-custom')).not.toBeInTheDocument();
  });
});
