import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TubSetModal } from './TubSetModal';
import { ToastProvider } from '../ui';
import * as api from '../../api';

vi.mock('../../api', async (orig) => ({
  ...(await orig<typeof import('../../api')>()),
  fetchLabelLayouts: vi.fn(),
  createTubSet: vi.fn(),
  uploadLabelPicture: vi.fn(),
  fetchLabelBrands: vi.fn(),
  printLabelJob: vi.fn(),
}));
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('./CustomLabels', () => ({ CustomLabelModal: ({ label }: { label: { name: string } }) => <div data-testid="full-editor">{label.name}</div> }));
vi.mock('./SheetPreview', () => ({ SheetPreview: ({ title }: { title: string }) => <div data-testid="preview">{title}</div> }));

const preset = (id: string, shape: string, w: number, h: number) => ({ id, shape, w, h, name: shape === 'circle' ? `${w} mm round` : `${w} × ${h} mm`, cm: '', design: 'small', options: [] });

const show = (props: Partial<Parameters<typeof TubSetModal>[0]> = {}) => render(<ToastProvider><TubSetModal onClose={() => {}} {...props} /></ToastProvider>);

beforeEach(() => {
  vi.mocked(api.fetchLabelLayouts).mockResolvedValue({
    data: [], limits: {}, wrap: {},
    presets: [preset('c80', 'circle', 80, 80), preset('c30', 'circle', 30, 30), preset('r100x50', 'rect', 100, 50), preset('r200x50', 'rect', 200, 50), preset('r40x60', 'rect', 40, 60)],
    tub_set: { lid: 'c80', side: 'r100x50', templates: [{ id: 'jhol-momo-round', name: 'Frozen Jhol Momo (round)', product: 'Frozen Jhol Momo', has_photo: true, photo_url: '/brand/photos/momo/momo-plate.png', fields: { label_ingredients: 'Wheat flour, chicken.', label_allergens: 'Wheat, Sesame', label_shelf_life_days: 30, label_pack_qty: 8 } }] },
  } as unknown as Awaited<ReturnType<typeof api.fetchLabelLayouts>>);
  vi.mocked(api.createTubSet).mockReset();
  vi.mocked(api.fetchLabelBrands).mockResolvedValue({ data: [] });
});

describe('TubSetModal', () => {
  it('offers round sizes for the lid and tub-side rectangles for the side', async () => {
    show();
    await waitFor(() => expect(screen.getByRole('option', { name: '80 mm round' })).toBeTruthy());
    expect(screen.queryByRole('option', { name: '30 mm round' })).toBeNull();
    expect(screen.getByRole('option', { name: '100 × 50 mm' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '200 × 50 mm' })).toBeNull();
    expect(screen.queryByRole('option', { name: '40 × 60 mm' })).toBeNull();
  });

  it('fills from a ready-made product, then makes the lid and the side label', async () => {
    const row = (part: string, id: number, w: number, h: number) => ({ part, label: { id, name: `Frozen Jhol Momo (${part === 'lid' ? 'Lid' : 'Side'})` }, job: { id: id + 100, name: part }, preset: 'p', w, h, one_url: '/one', view_url: '/v', pdf_url: '/p' });
    vi.mocked(api.createTubSet).mockResolvedValue({ data: [row('lid', 1, 80, 80), row('side', 2, 100, 50)], expires_in_minutes: 30 } as unknown as Awaited<ReturnType<typeof api.createTubSet>>);
    const onMade = vi.fn();
    show({ onMade });
    await screen.findByRole('option', { name: 'Frozen Jhol Momo' });

    fireEvent.click(screen.getByTestId('tub-set-make'));
    expect(api.createTubSet).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'jhol-momo-round' } });
    expect((screen.getByLabelText('Product name') as HTMLInputElement).value).toBe('Frozen Jhol Momo');
    expect((screen.getByLabelText('Ingredients (on the side)') as HTMLTextAreaElement).value).toBe('Wheat flour, chicken.');
    expect(screen.getByRole('button', { name: 'The photo that comes with it' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Price (MVR)'), { target: { value: '45' } });
    fireEvent.click(screen.getByTestId('tub-set-make'));

    await screen.findByTestId('tub-set-made');
    expect(api.createTubSet).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Frozen Jhol Momo', template: 'jhol-momo-round', photo: 'builtin', lid: 'c80', side: 'r100x50', on: 'sheet',
      label_ingredients: 'Wheat flour, chicken.', label_pack_qty: 8, label_shelf_life_days: 30, label_price: 45,
    }));
    expect(onMade).toHaveBeenCalled();
    expect(screen.getByText('Round, 80 mm · name and photo')).toBeTruthy();
    expect(screen.getByText('100 × 50 mm · the details')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Print/ }).length).toBe(2);
  });

  /** Owner, 2026-11-16: "no photo add and drop option". */
  it('takes a photo dropped on the box or picked with Upload a photo, and uses it for the labels', async () => {
    vi.mocked(api.uploadLabelPicture).mockResolvedValue({ data: { id: 77, url: '/storage/library/labels/a.png' } });
    vi.mocked(api.createTubSet).mockResolvedValue({ data: [], expires_in_minutes: 30 } as unknown as Awaited<ReturnType<typeof api.createTubSet>>);
    show();
    await screen.findByTestId('tub-set-upload');
    const png = new File(['x'], 'momo.png', { type: 'image/png' });

    fireEvent.drop(screen.getByTestId('tub-set-drop'), { dataTransfer: { files: [png] } });
    await waitFor(() => expect(api.uploadLabelPicture).toHaveBeenCalledWith(png, 'photo'));
    await waitFor(() => expect(document.querySelector('img[src="/storage/library/labels/a.png"]')).toBeTruthy());

    fireEvent.change(screen.getByTestId('tub-set-drop-file'), { target: { files: [png] } });
    await waitFor(() => expect(api.uploadLabelPicture).toHaveBeenCalledTimes(2));

    // Something that is not a picture is refused before anything is sent.
    fireEvent.drop(screen.getByTestId('tub-set-drop'), { dataTransfer: { files: [new File(['x'], 'bill.pdf', { type: 'application/pdf' })] } });
    expect(api.uploadLabelPicture).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Garlic Sauce' } });
    fireEvent.click(screen.getByTestId('tub-set-make'));
    await waitFor(() => expect(api.createTubSet).toHaveBeenCalledWith(expect.objectContaining({ name: 'Garlic Sauce', photo: 77 })));

  });

  /** Owner, 2026-11-16: "on the lid, price and item barcode for shops to use"; the form had "very few" options. */
  it('takes a barcode and the rest of the details, and opens the full editor on a made label', async () => {
    const row = (part: string, id: number, w: number, h: number) => ({ part, label: { id, name: `Garlic Sauce (${part === 'lid' ? 'Lid' : 'Side'})` }, job: { id: id + 100, name: part }, preset: 'p', w, h, one_url: '/one', view_url: '/v', pdf_url: '/p' });
    vi.mocked(api.createTubSet).mockResolvedValue({ data: [row('lid', 1, 80, 80), row('side', 2, 100, 50)], expires_in_minutes: 30 } as unknown as Awaited<ReturnType<typeof api.createTubSet>>);
    show();
    await screen.findByTestId('tub-set-barcode');
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Garlic Sauce' } });

    fireEvent.click(screen.getByTestId('tub-set-make-barcode'));
    const code = (screen.getByTestId('tub-set-barcode') as HTMLInputElement).value;
    expect(code).toMatch(/^2\d{11}$/);
    fireEvent.change(screen.getByLabelText('Name in Dhivehi'), { target: { value: 'ލޮނުމެދު ސޯސް' } });
    fireEvent.change(screen.getByLabelText('Storage'), { target: { value: 'chilled' } });
    fireEvent.change(screen.getByLabelText('Note (on the side)'), { target: { value: 'Shake before use.' } });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'both' } });
    fireEvent.click(screen.getByTestId('tub-set-make'));

    await screen.findByTestId('tub-set-made');
    expect(api.createTubSet).toHaveBeenCalledWith(expect.objectContaining({
      label_barcode: code, name_dv: 'ލޮނުމެދު ސޯސް', label_storage: 'chilled', label_note: 'Shake before use.', label_lang: 'both',
    }));
    fireEvent.click(screen.getByTestId('tub-set-edit-lid'));
    expect(screen.getByTestId('full-editor').textContent).toBe('Garlic Sauce (Lid)');
  });
});
