import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
}));
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('./TypesAndBrands', () => ({ BrandModal: () => <div data-testid="brand-modal" /> }));

import { CustomLabelModal, CustomLabelsTab } from './CustomLabels';

const custom = (id: number, name: string, extra = {}) => ({
  id, kind: 'custom', name, name_dv: null, brand_id: 2, brand_name: 'Amma', brand_logo_url: '/storage/amma.png', label_type_id: null, label_type_name: null,
  label_storage: null, storage: 'chilled', label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null,
  label_ingredients: 'Garlic, oil', label_ingredients_dv: null, label_how_to_use: null, label_how_to_use_dv: null, label_note: null, label_note_dv: null,
  label_shelf_life_days: 14, label_pack_qty: null, label_pack_unit: null, label_price: null, label_barcode: null, label_net_weight: null, label_allergens: null,
  label_photo_media_id: null, label_photo_url: null, label_title_media_id: null, label_title_url: null,
  defaults: { heading: 'CHILLED', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Amma', unit: 'PCS' },
  ingredients: { en: 'Garlic, oil', dv: '', from: 'manual' }, created_by: null, updated_at: null, ...extra,
});

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>);

describe('CustomLabelModal', () => {
  beforeEach(() => {
    [fetchCustomLabels, createCustomLabel, updateCustomLabel, uploadCustomLabelPicture, duplicateCustomLabel, deleteCustomLabel, stickerLinks, previewCustomDraft].forEach((f) => f.mockReset());
    stickerLinks.mockResolvedValue({ url: '/labels/stickers?signature=x', one_url: '/labels/stickers?one=1&signature=x' });
    previewCustomDraft.mockResolvedValue({ url: '/labels/stickers?signature=d', one_url: '/labels/stickers?one=1&signature=d', expires_in_minutes: 30 });
  });

  // 2026-10-12: the preview redraws from the draft as it is typed, before anything is saved.
  it('adds a label with its own brand and details, previewing it at 4 × 6 cm as it is typed', async () => {
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
      layout: 'single-custom', w: 40, h: 60, lang: 'en',
    })), { timeout: 3000 });
    expect(stickerLinks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('custom-label-save'));

    await waitFor(() => expect(createCustomLabel).toHaveBeenCalledTimes(1));
    expect(createCustomLabel.mock.calls[0][0]).toMatchObject({
      name: 'Garlic Sauce', brand_id: 2, label_ingredients: 'Garlic, oil', label_shelf_life_days: 14, label_pack_unit: 'ML',
      label_heading: null, label_note: null, label_type_id: null, label_price: 25, label_barcode: '590123412345', label_net_weight: '250 ml', label_allergens: 'garlic',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 7 })));
    expect(await screen.findByRole('button', { name: 'Print' })).toBeInTheDocument();
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
    [fetchCustomLabels, duplicateCustomLabel, deleteCustomLabel, stickerLinks].forEach((f) => f.mockReset());
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
    await waitFor(() => expect(stickerLinks).toHaveBeenCalledWith({ items: [{ id: 8, copies: 4, kind: 'custom' }], layout: 'a4-4', lang: 'both', fill: true }));
    expect(await screen.findByTestId('saved-tab')).toBeInTheDocument();
    expect(screen.getByText('Saved as “Theluli Rihaakuru · 4 stickers”.')).toBeInTheDocument();
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
