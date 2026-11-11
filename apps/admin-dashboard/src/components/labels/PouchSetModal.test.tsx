import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PouchSetModal } from './PouchSetModal';
import { ToastProvider } from '../ui';
import * as api from '../../api';

vi.mock('../../api', async (orig) => ({
  ...(await orig<typeof import('../../api')>()),
  fetchLabelLayouts: vi.fn(),
  createPouchSet: vi.fn(),
  printLabelJob: vi.fn(),
}));
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('./SheetPreview', () => ({ SheetPreview: ({ title }: { title: string }) => <div data-testid="preview">{title}</div> }));

const rect = (id: string, w: number, h: number) => ({ id, shape: 'rect', w, h, name: `${w} × ${h} mm`, cm: '', design: 'small', options: [] });

const show = (props: Partial<Parameters<typeof PouchSetModal>[0]> = {}) => render(<ToastProvider><PouchSetModal onClose={() => {}} {...props} /></ToastProvider>);

beforeEach(() => {
  vi.mocked(api.fetchLabelLayouts).mockResolvedValue({
    data: [], presets: [rect('r40x30', 40, 30), rect('r120x53', 120, 53), rect('r140x62', 140, 62), rect('r160x70', 160, 70)], limits: {}, wrap: {},
    pouch_set: {
      sizes: [{ word: 'Small', qty: 6, price: 35, preset: 'r120x53' }, { word: 'Medium', qty: 8, price: 45, preset: 'r140x62' }, { word: 'Large', qty: 12, price: 65, preset: 'r160x70' }],
      max_sizes: 4, templates: [{ id: 'momo-pouch', name: 'Frozen momo pouch (microwave)', has_photo: true }, { id: 'pouch-any', name: 'Pouch label (any product)', has_photo: false }], photo_url: '/brand/photos/momo/momo-plate.png',
    },
  } as unknown as Awaited<ReturnType<typeof api.fetchLabelLayouts>>);
  vi.mocked(api.createPouchSet).mockReset();
});

describe('PouchSetModal', () => {
  it('starts on the three momo sizes with the photo, and only wide sizes are offered', async () => {
    show();
    await screen.findByDisplayValue('Small');
    expect(screen.getByDisplayValue('Medium')).toBeTruthy();
    expect(screen.getByDisplayValue('Large')).toBeTruthy();
    expect((screen.getByLabelText('Pieces', { selector: '#ps-qty-2' }) as HTMLInputElement).value).toBe('12');
    await waitFor(() => expect(screen.getAllByRole('option', { name: '140 × 62 mm' }).length).toBe(3));
    expect(screen.queryByRole('option', { name: '40 × 30 mm' })).toBeNull();
    expect(screen.getByRole('button', { name: 'The momo photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make the 3 labels' })).toBeTruthy();
  });

  it('asks for a name, then makes the labels and shows each with Print', async () => {
    const row = (word: string, id: number, w: number, h: number) => ({ label: { id, name: `Chicken Momo (${word})`, label_pack_qty: 8, label_price: 45 }, job: { id: id + 100, name: word }, preset: 'r', w, h, one_url: '/one', view_url: '/v', pdf_url: '/p' });
    vi.mocked(api.createPouchSet).mockResolvedValue({ data: [row('Small', 1, 120, 53), row('Medium', 2, 140, 62), row('Large', 3, 160, 70)], expires_in_minutes: 30 } as unknown as Awaited<ReturnType<typeof api.createPouchSet>>);
    const onMade = vi.fn();
    show({ onMade });
    await screen.findByDisplayValue('Small');
    fireEvent.click(screen.getByTestId('pouch-set-make'));
    expect(api.createPouchSet).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Chicken Momo' } });
    fireEvent.change(screen.getByLabelText('Price (MVR)', { selector: '#ps-price-0' }), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('pouch-set-make'));
    await screen.findByTestId('pouch-set-made');
    expect(api.createPouchSet).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Chicken Momo', template: 'momo-pouch', photo: 'builtin', on: 'sheet',
      sizes: [{ word: 'Small', qty: 6, price: 40, preset: 'r120x53' }, { word: 'Medium', qty: 8, price: 45, preset: 'r140x62' }, { word: 'Large', qty: 12, price: 65, preset: 'r160x70' }],
    }));
    expect(onMade).toHaveBeenCalled();
    expect(screen.getAllByTestId('preview')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /Print/ })).toHaveLength(3);
    expect(screen.getByText('Chicken Momo (Large)')).toBeTruthy();
  });

  it('a template without a photo sends none, and a size can be removed or added', async () => {
    vi.mocked(api.createPouchSet).mockResolvedValue({ data: [], expires_in_minutes: 30 } as unknown as Awaited<ReturnType<typeof api.createPouchSet>>);
    show();
    await screen.findByDisplayValue('Small');
    fireEvent.change(screen.getByLabelText('What it is'), { target: { value: 'pouch-any' } });
    expect(screen.queryByRole('button', { name: 'The momo photo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Large' }));
    expect(screen.getByRole('button', { name: 'Make the 2 labels' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add a size/ }));
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Samosa' } });
    fireEvent.click(screen.getByTestId('pouch-set-make'));
    expect(api.createPouchSet).not.toHaveBeenCalled(); // the new size has no word yet
    fireEvent.change(screen.getByLabelText('Size word', { selector: '#ps-word-2' }), { target: { value: 'Family' } });
    fireEvent.click(screen.getByTestId('pouch-set-make'));
    await waitFor(() => expect(api.createPouchSet).toHaveBeenCalledWith(expect.objectContaining({ template: 'pouch-any', photo: null, sizes: expect.arrayContaining([expect.objectContaining({ word: 'Family' })]) })));
  });
});
