/**
 * Owner, 2026-11-14: "Still i feel saving, printing ect of labels are confusing". My labels is one list of every
 * label, each row with Print (the pop-up with the dates) and Edit; the sheets printed before fold beneath.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../ui';

const fetchLabelProducts = vi.fn();
const stickerLinks = vi.fn();
const fetchLabelLayouts = vi.fn();

vi.mock('../../api', () => ({
  fetchLabelProducts: (...a: unknown[]) => fetchLabelProducts(...a),
  stickerLinks: (...a: unknown[]) => stickerLinks(...a),
  fetchLabelLayouts: (...a: unknown[]) => fetchLabelLayouts(...a),
  openLabelSheet: vi.fn(),
  downloadLabelSheet: vi.fn(),
  signOffLabel: vi.fn(),
  fetchLabelSignoff: vi.fn(),
}));
vi.mock('./CustomLabels', () => ({ CustomLabelsTab: () => <div data-testid="custom-list" /> }));
vi.mock('./ExpiringStock', () => ({ ExpiringStock: () => null }));
vi.mock('./ItemLabelTab', () => ({ ItemLabelTab: ({ itemId }: { itemId: number }) => <div data-testid="item-editor">{itemId}</div> }));
vi.mock('./ChooseItemsModal', () => ({ ChooseItemsModal: () => <div data-testid="choose-items" /> }));
vi.mock('./ReprintScan', () => ({ ReprintScan: () => <div data-testid="reprint-scan" /> }));

import { MyLabelsTab } from './MyLabels';

const item = (id: number, name: string, extra = {}) => ({ id, name, name_dv: null, label_enabled: true, label_shelf_life_days: 30, label_pack_qty: null, label_photo_url: null, label_pouch: null, label_wrap: null, defaults: { shelf_life_days: null }, ...extra });
const show = (props = {}) => render(
  <MemoryRouter initialEntries={['/labels/mine']}>
    <ToastProvider>
      <Routes>
        <Route path="/labels/mine" element={<MyLabelsTab canManage printedBefore={<div data-testid="printed-list" />} {...props} />} />
        <Route path="/labels/make" element={<div data-testid="wizard" />} />
        <Route path="/labels/stickers" element={<div data-testid="print-labels" />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>,
);

describe('MyLabelsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchLabelProducts.mockResolvedValue({ data: [item(12, 'Bajiya', { sizes: [{ id: 3, name: 'Large', price: 20 }] }), item(13, 'Samosa', { name_dv: 'ސަމޯސާ' })] });
    fetchLabelLayouts.mockResolvedValue({ data: [], presets: [{ id: 'r105x148', shape: 'rect', w: 105, h: 148, name: '105 × 148 mm', cm: '', design: 'full', options: [{ on: 'sheet', layout: 'a4-4', label: 'A4 sheet', per_page: 4, landscape: false }] }], limits: null, rolls: [] });
    stickerLinks.mockResolvedValue({ url: '/u', one_url: '/o', view_url: '/v', pdf_url: '/x.pdf', expires_in_minutes: 30, summary: { design: 'full', w: 105, h: 148, products: [{ id: 12, name: 'Bajiya', copies: 1, mfg: '2026-11-14', exp: '2026-12-14', shelf_life_days: 30, ingredients_from: 'recipe' }], dropped: [] } });
  });

  it('lists the custom labels and the menu items, each menu item with Print and Edit', async () => {
    show();
    expect(screen.getByTestId('custom-list')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Print Bajiya' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Samosa' })).toBeInTheDocument();
    // The sheets printed before are there, folded until asked for.
    expect(screen.getByTestId('my-labels-printed')).not.toHaveAttribute('open');
    expect(screen.getByTestId('printed-list')).toBeInTheDocument();
  });

  it('Print on a menu item opens the pop-up with nothing printed, and offers its sizes', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Print Bajiya' }));
    expect(await screen.findByRole('dialog', { name: 'Print Bajiya' })).toBeInTheDocument();
    await waitFor(() => expect(stickerLinks).toHaveBeenCalled(), { timeout: 3000 });
    const body = stickerLinks.mock.calls[0][0] as { items: unknown[]; preview?: boolean };
    expect(body.items).toEqual([{ id: 12, copies: 1, kind: 'item' }]);
    expect(body.preview).toBe(true);
    expect(screen.getByLabelText('Which size is this sticker for?')).toBeInTheDocument();
  });

  it('Edit opens the item\'s label details, and the two buttons lead to a new label and the full form', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Samosa' }));
    expect(await screen.findByTestId('item-editor')).toHaveTextContent('13');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByTestId('my-labels-several'));
    expect(await screen.findByTestId('print-labels')).toBeInTheDocument();
  });

  it('opens the printed sheets when it was reached by the old Saved labels address', () => {
    show({ openPrinted: true });
    expect(screen.getByTestId('my-labels-printed')).toHaveAttribute('open');
  });
});
