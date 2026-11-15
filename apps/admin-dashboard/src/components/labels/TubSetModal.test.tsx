import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TubSetModal } from './TubSetModal';
import { ToastProvider } from '../ui';
import * as api from '../../api';

vi.mock('../../api', async (orig) => ({
  ...(await orig<typeof import('../../api')>()),
  fetchLabelLayouts: vi.fn(),
  createTubSet: vi.fn(),
  printLabelJob: vi.fn(),
}));
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));
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
});
