import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../ui';

const fetchCustomLabels = vi.fn();
const createCustomLabel = vi.fn();
const updateCustomLabel = vi.fn();
const uploadCustomLabelPicture = vi.fn();
const duplicateCustomLabel = vi.fn();
const deleteCustomLabel = vi.fn();
const stickerLinks = vi.fn();
const previewCustomDraft = vi.fn();
const fetchLabelLayouts = vi.fn();

vi.mock('../../api', () => ({
  fetchLabelBrands: () => Promise.resolve({ data: [
    { id: 1, name: 'Bake & Grill', is_default: true, logo_url: null },
    { id: 2, name: 'Amma', is_default: false, logo_url: '/storage/amma.png' },
  ] }),
  fetchLabelTypes: () => Promise.resolve({ data: [] }),
  fetchCustomLabels: (...a: unknown[]) => fetchCustomLabels(...a),
  createCustomLabel: (...a: unknown[]) => createCustomLabel(...a),
  updateCustomLabel: (...a: unknown[]) => updateCustomLabel(...a),
  uploadCustomLabelPicture: (...a: unknown[]) => uploadCustomLabelPicture(...a),
  duplicateCustomLabel: (...a: unknown[]) => duplicateCustomLabel(...a),
  deleteCustomLabel: (...a: unknown[]) => deleteCustomLabel(...a),
  stickerLinks: (...a: unknown[]) => stickerLinks(...a),
  previewCustomDraft: (...a: unknown[]) => previewCustomDraft(...a),
  fetchLabelLayouts: (...a: unknown[]) => fetchLabelLayouts(...a),
}));
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('./TypesAndBrands', () => ({ BrandModal: () => <div data-testid="brand-modal" /> }));

import { CustomLabelModal, CustomLabelsTab } from './CustomLabels';
import type { CustomLabel } from '../../api';

const custom = (id: number, name: string, extra: Partial<CustomLabel> = {}): CustomLabel => ({
  id, kind: 'custom' as const, name, name_dv: null, brand_id: 2, brand_name: 'Amma', brand_logo_url: '/storage/amma.png', label_type_id: null, label_type_name: null,
  label_storage: null, storage: 'chilled', label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null,
  label_ingredients: 'Garlic, oil', label_ingredients_dv: null, label_how_to_use: null, label_how_to_use_dv: null, label_note: null, label_note_dv: null,
  label_shelf_life_days: 14, label_pack_qty: null, label_pack_unit: null, label_price: null, label_barcode: null, label_net_weight: null, label_allergens: null,
  label_footer: null, label_footer_dv: null, label_footer_style: 'brand', label_show_qr: null, label_lang: null, print_count: 0, last_printed_at: null,
  label_photo_media_id: null, label_photo_url: null, label_title_media_id: null, label_title_url: null,
  defaults: { heading: 'CHILLED', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Amma', unit: 'PCS' },
  ingredients: { en: 'Garlic, oil', dv: '', from: 'manual' }, created_by: null, updated_at: null, ...extra,
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>);

const preset = (id: string, shape: 'rect' | 'circle', w: number, h: number, design: string, options: [string, string, string, number][]) => ({
  id, shape, w, h, name: shape === 'circle' ? `Round ${w} mm` : `${w} × ${h} mm`, cm: '', design,
  options: options.map(([on, layout, label, per_page]) => ({ on, layout, label, per_page, landscape: layout === 'a4-custom' })),
});
const LAYOUTS = {
  data: [],
  presets: [
    preset('r105x148', 'rect', 105, 148.5, 'full', [['sheet', 'a4-4', 'A4 sheet', 4], ['printer', 'single-105x148', 'Label printer', 1]]),
    preset('r40x60', 'rect', 40, 60, 'small', [['sheet', 'a4-custom', 'A4 sheet', 21], ['printer', 'single-custom', 'Label printer', 1]]),
  ],
  limits: { min_short: 20, min_long: 30, max_w: 210, max_h: 297, min_round: 30, max_round: 200, sheet_margin: 5 },
};

describe('CustomLabelModal', () => {
  beforeEach(() => {
    [fetchCustomLabels, createCustomLabel, updateCustomLabel, uploadCustomLabelPicture, duplicateCustomLabel, deleteCustomLabel, stickerLinks, previewCustomDraft, fetchLabelLayouts].forEach((f) => f.mockReset());
    fetchLabelLayouts.mockResolvedValue(LAYOUTS);
    try { localStorage.clear(); } catch { /* jsdom */ }
    stickerLinks.mockResolvedValue({ url: '/labels/stickers?signature=x', one_url: '/labels/stickers?one=1&signature=x' });
    previewCustomDraft.mockResolvedValue({ url: '/labels/stickers?signature=d', one_url: '/labels/stickers?one=1&signature=d', expires_in_minutes: 30 });
  });

  // 2026-10-12: the preview redraws from the draft as it is typed, before anything is saved.
  it('adds a label with its own brand and details, previewing it at the print size as it is typed', async () => {
    const onSaved = vi.fn();
    createCustomLabel.mockResolvedValue({ data: custom(7, 'Garlic Sauce') });
    wrap(<CustomLabelModal label={null} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: '  Garlic Sauce ' } });
    await screen.findByRole('option', { name: 'Amma' });
    fireEvent.change(screen.getByLabelText('Brand and logo'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Ingredients'), { target: { value: 'Garlic, oil' } });
    fireEvent.change(screen.getByLabelText('Shelf life (days)'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('Unit after the quantity'), { target: { value: 'ml' } });
    fireEvent.change(screen.getByLabelText('Allergens'), { target: { value: 'garlic' } });
    fireEvent.change(screen.getByLabelText('Price (MVR)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Barcode (EAN-13 or EAN-8)'), { target: { value: '590123412345' } });
    fireEvent.change(screen.getByLabelText('Net weight'), { target: { value: '250 ml' } });

    // The draft is drawn before Save, at the size picked, with everything typed so far.
    await waitFor(() => expect(previewCustomDraft).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Garlic Sauce', brand_id: 2, label_ingredients: 'Garlic, oil', label_allergens: 'garlic', label_price: 25, label_barcode: '590123412345', label_net_weight: '250 ml',
      layout: 'a4-4', w: null, h: null, lang: 'en',
    })), { timeout: 3000 });
    expect(stickerLinks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('custom-label-save'));

    await waitFor(() => expect(createCustomLabel).toHaveBeenCalledTimes(1));
    expect(createCustomLabel.mock.calls[0][0]).toMatchObject({
      name: 'Garlic Sauce', brand_id: 2, label_ingredients: 'Garlic, oil', label_shelf_life_days: 14, label_pack_unit: 'ML',
      label_heading: null, label_note: null, label_type_id: null, label_price: 25, label_barcode: '590123412345', label_net_weight: '250 ml', label_allergens: 'garlic',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 7 })));
    expect(await screen.findByRole('button', { name: /^Print/ })).toBeInTheDocument();
  });

  // Audit, 2026-10-12: the label picks its footer, its QR and its language;
  // Print… carries the size and language to Pack stickers; closing with
  // changes asks first.
  it('saves the footer choice, the QR switch and the language, and previews in that language', async () => {
    createCustomLabel.mockResolvedValue({ data: custom(9, 'Gift Box', { label_footer_style: 'standard', label_show_qr: false, label_lang: 'both' }) });
    wrap(<CustomLabelModal label={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Gift Box' } });
    fireEvent.click(screen.getByRole('radio', { name: /Standard Bake & Grill footer/ }));
    fireEvent.change(screen.getByLabelText('Complaints QR in the footer'), { target: { value: 'off' } });
    fireEvent.click(screen.getByRole('button', { name: 'Both' }));
    await waitFor(() => expect(previewCustomDraft).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gift Box', label_footer_style: 'standard', label_show_qr: false, label_lang: 'both', lang: 'both' })), { timeout: 3000 });
    // Own words show their boxes only when picked.
    expect(screen.queryByLabelText('Footer line')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Your own words/ }));
    fireEvent.change(screen.getByLabelText('Footer line'), { target: { value: 'Made with love' } });
    fireEvent.click(screen.getByTestId('custom-label-save'));
    await waitFor(() => expect(createCustomLabel).toHaveBeenCalledTimes(1));
    expect(createCustomLabel.mock.calls[0][0]).toMatchObject({ label_footer_style: 'own', label_footer: 'Made with love', label_show_qr: false, label_lang: 'both' });
  });

  it('Print… saves first and opens Pack stickers on the same size and language', async () => {
    createCustomLabel.mockResolvedValue({ data: custom(9, 'Gift Box') });
    localStorage.setItem('labels.lastSize', JSON.stringify({ shape: 'rect', preset: 'r40x60', on: 'sheet', w: 40, h: 60 }));
    render(
      <MemoryRouter initialEntries={['/labels/custom']}>
        <ToastProvider>
          <Routes>
            <Route path="/labels/custom" element={<CustomLabelModal label={null} onClose={() => {}} onSaved={() => {}} />} />
            <Route path="/labels/stickers" element={<div data-testid="stickers-tab">{window.location.search}</div>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchLabelLayouts).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Gift Box' } });
    expect(await screen.findByText(/40 × 60 mm · A4 sheet/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('custom-label-print'));
    await waitFor(() => expect(createCustomLabel).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('stickers-tab')).toBeInTheDocument();
  });

  it('asks before closing with unsaved changes, and closes at once without any', async () => {
    const onClose = vi.fn();
    wrap(<CustomLabelModal label={custom(7, 'Garlic Sauce')} onClose={onClose} onSaved={() => {}} />);
    const closeButton = () => within(screen.getByTestId('modal-footer')).getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Garlic Sauce 2' } });
    fireEvent.click(closeButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Close without saving?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('asks for a name before saving', async () => {
    wrap(<CustomLabelModal label={null} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByTestId('custom-label-save'));
    expect(await screen.findByText('Give the label a name.')).toBeInTheDocument();
    expect(createCustomLabel).not.toHaveBeenCalled();
  });

  it('saves a new label first when a picture is uploaded', async () => {
    createCustomLabel.mockResolvedValue({ data: custom(9, 'Gift box') });
    uploadCustomLabelPicture.mockResolvedValue({ data: custom(9, 'Gift box', { label_photo_media_id: 31, label_photo_url: '/storage/box.png' }) });
    wrap(<CustomLabelModal label={null} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Gift box' } });
    const file = new File(['png'], 'box.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('custom-label-photo-file'), { target: { files: [file] } });

    await waitFor(() => expect(uploadCustomLabelPicture).toHaveBeenCalledWith(9, file, 'photo'));
    expect(createCustomLabel).toHaveBeenCalledTimes(1);
  });
});

describe('CustomLabelsTab', () => {
  beforeEach(() => {
    [fetchCustomLabels, duplicateCustomLabel, deleteCustomLabel, stickerLinks, fetchLabelLayouts].forEach((f) => f.mockReset());
    fetchLabelLayouts.mockResolvedValue(LAYOUTS);
    try { localStorage.clear(); } catch { /* jsdom */ }
    stickerLinks.mockResolvedValue({ url: '/labels/stickers?signature=x' });
    fetchCustomLabels.mockResolvedValue({ data: [custom(7, 'Garlic Sauce')] });
  });

  it('lets anyone who prints labels print one, and only label managers change them', async () => {
    const { unmount } = wrap(<CustomLabelsTab canManage={false} />);
    expect(await screen.findByText('Garlic Sauce')).toBeInTheDocument();
    expect(screen.getByText(/Amma · No type · Chilled · keeps 14 days/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print Garlic Sauce' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Garlic Sauce' })).toBeNull();
    expect(screen.queryByTestId('custom-label-new')).toBeNull();
    unmount();

    wrap(<CustomLabelsTab canManage />);
    expect(await screen.findByTestId('custom-label-new')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Garlic Sauce' })).toBeInTheDocument();
  });

  // Owner, 2026-10-12: "no option to send to saved labels".
  it('saves a label to Saved labels in one tap, as a full A4 sheet, and goes there', async () => {
    fetchCustomLabels.mockResolvedValue({ data: [custom(7, 'Garlic Sauce'), custom(8, 'Theluli Rihaakuru', { name_dv: 'ތެލުލި ރިހާކުރު' })] });
    stickerLinks.mockResolvedValue({ url: '/labels/stickers?signature=x', view_url: '/x', pdf_url: '/x.pdf', expires_in_minutes: 30, job: { id: 3, name: 'Theluli Rihaakuru · 4 stickers' } });
    render(
      <MemoryRouter initialEntries={['/labels/custom']}>
        <ToastProvider>
          <Routes>
            <Route path="/labels/custom" element={<CustomLabelsTab canManage={false} />} />
            <Route path="/labels/saved" element={<div data-testid="saved-tab" />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save Theluli Rihaakuru to Saved labels' }));
    await waitFor(() => expect(stickerLinks).toHaveBeenCalledWith({ items: [{ id: 8, copies: 4, kind: 'custom' }], layout: 'a4-4', w: null, h: null, lang: 'both', fill: true }));
    expect(await screen.findByTestId('saved-tab')).toBeInTheDocument();
    expect(screen.getByText('Saved as “Theluli Rihaakuru · 4 stickers”.')).toBeInTheDocument();
  });

  // Owner, 2026-10-12: "Layout of the custom labels is different when i go to
  // print". Save and the editor's preview follow the size Pack stickers last
  // printed, so a 4 × 6 cm owner gets a sheet of 4 × 6 cm.
  it('saves at the size Pack stickers last printed, a full sheet of it', async () => {
    localStorage.setItem('labels.lastSize', JSON.stringify({ shape: 'rect', preset: 'r40x60', on: 'sheet', w: 40, h: 60 }));
    fetchCustomLabels.mockResolvedValue({ data: [custom(7, 'Garlic Sauce')] });
    stickerLinks.mockResolvedValue({ url: '/x', view_url: '/x', pdf_url: '/x.pdf', expires_in_minutes: 30, job: { id: 4, name: 'Garlic Sauce · 21 stickers' } });
    wrap(<CustomLabelsTab canManage={false} />);
    await waitFor(() => expect(fetchLabelLayouts).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Save Garlic Sauce to Saved labels' }));
    await waitFor(() => expect(stickerLinks).toHaveBeenCalledWith({ items: [{ id: 7, copies: 21, kind: 'custom' }], layout: 'a4-custom', w: 40, h: 60, lang: 'en', fill: true }));
  });

  it('says how often each label was printed, in which language, and finds one by name, brand or type', async () => {
    fetchCustomLabels.mockResolvedValue({ data: [
      custom(1, 'Garlic Sauce', { print_count: 3, last_printed_at: '2026-10-12T08:00:00Z' }),
      custom(2, 'Chilli Paste', { label_lang: 'dv' }),
      custom(3, 'Gift Box', { brand_name: 'Bake & Grill' }),
      custom(4, 'Fish Chutney', { label_type_name: 'Frozen Hedhika' }),
    ] });
    wrap(<CustomLabelsTab canManage={false} />);
    expect(await screen.findByTestId('custom-printed-1')).toHaveTextContent('Printed 3 times, last 12 Oct · prints in English');
    expect(screen.getByTestId('custom-printed-2')).toHaveTextContent('Not printed yet · prints in Dhivehi');
    fireEvent.change(screen.getByLabelText('Find a custom label'), { target: { value: 'frozen' } });
    expect(screen.getByText('Fish Chutney')).toBeInTheDocument();
    expect(screen.queryByText('Garlic Sauce')).toBeNull();
    fireEvent.change(screen.getByLabelText('Find a custom label'), { target: { value: 'zzz' } });
    expect(screen.getByText('No label matches “zzz”.')).toBeInTheDocument();
  });

  it('copies a label into the editor and removes one after asking', async () => {
    duplicateCustomLabel.mockResolvedValue({ data: custom(8, 'Garlic Sauce (copy)') });
    deleteCustomLabel.mockResolvedValue({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    wrap(<CustomLabelsTab canManage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy Garlic Sauce' }));
    await waitFor(() => expect(duplicateCustomLabel).toHaveBeenCalledWith(7));
    expect(await screen.findByText('Edit Garlic Sauce (copy)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Garlic Sauce' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Prints already made stay in the log.'));
    await waitFor(() => expect(deleteCustomLabel).toHaveBeenCalledWith(7));
    confirm.mockRestore();
  });
});
