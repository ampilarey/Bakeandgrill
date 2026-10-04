import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const fetchLabelShops = vi.fn();
const fetchShopBoxLabel = vi.fn();
const saveShopBoxLabel = vi.fn();
const fetchTradeDeliveries = vi.fn();
const fetchDeliveryBoxLabel = vi.fn();
const fetchLabelProducts = vi.fn();
const boxLabelLinks = vi.fn();

vi.mock('../../api', () => ({
  fetchLabelShops: (...a: unknown[]) => fetchLabelShops(...a),
  fetchShopBoxLabel: (...a: unknown[]) => fetchShopBoxLabel(...a),
  saveShopBoxLabel: (...a: unknown[]) => saveShopBoxLabel(...a),
  fetchTradeDeliveries: (...a: unknown[]) => fetchTradeDeliveries(...a),
  fetchDeliveryBoxLabel: (...a: unknown[]) => fetchDeliveryBoxLabel(...a),
  fetchLabelProducts: (...a: unknown[]) => fetchLabelProducts(...a),
  boxLabelLinks: (...a: unknown[]) => boxLabelLinks(...a),
  openLabelSheet: vi.fn(),
  printsViaPdf: () => false,
  fetchLabelJob: vi.fn(),
  renameLabelJob: vi.fn(),
  downloadLabelSheet: vi.fn(),
}));

import { BoxLabelPanel } from './BoxLabelPanel';

const prefill = {
  trade_account_id: 7,
  saved: true,
  fields: { customer: 'NH Kuda Rah', attn: 'Adam Firash Ali Hameed', contact: 'Central Purchasing Coordinator · +960 911 9368', boat: 'MGH 14', boat2: 'Seamaster 17', pickup: 'T Jetty', pickup2: 'Malé', when: '', when2: '8:00 AM – 2:00 PM', po: '', box: '', of: '' },
  lines: [
    { id: 1, qty: 0, name: 'Masroshi', article: 'FROZEN - SHORT EAT - MASROSHI-PIECE', default_article: 'FROZEN - SHORT EAT - MASROSHI-PIECE' },
    { id: 2, qty: 0, name: 'Bajiya', article: 'FROZEN - SHORT EAT - BAJIYAA-PIECE', default_article: 'FROZEN - SHORT EAT - BAJIYA-PIECE' },
  ],
};

describe('BoxLabelPanel', () => {
  beforeEach(() => {
    [fetchLabelShops, fetchShopBoxLabel, saveShopBoxLabel, fetchTradeDeliveries, fetchDeliveryBoxLabel, fetchLabelProducts, boxLabelLinks].forEach((f) => f.mockReset());
    fetchLabelShops.mockResolvedValue({ data: [{ id: 7, shop_name: 'NH Kuda Rah', saved: true }] });
    fetchTradeDeliveries.mockResolvedValue({ data: [] });
    fetchLabelProducts.mockResolvedValue({ data: [{ id: 3, name: 'Handoo Gulha' }] });
    fetchShopBoxLabel.mockResolvedValue({ data: prefill });
  });

  it('fills the whole label from the shop and saves changes back to it', async () => {
    render(<MemoryRouter><BoxLabelPanel /></MemoryRouter>);
    await screen.findByRole('option', { name: 'NH Kuda Rah ✓' });
    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: '7' } });

    expect(await screen.findByDisplayValue('MGH 14')).toBeInTheDocument();
    expect(screen.getByLabelText('Pick-up point')).toHaveValue('T Jetty');
    expect(screen.getByLabelText('Article name for Bajiya')).toHaveValue('FROZEN - SHORT EAT - BAJIYAA-PIECE');

    // A new item with the shop's own name for it.
    fireEvent.change(screen.getByLabelText('Add a line'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Article name for Handoo Gulha'), { target: { value: 'FROZEN - SHORT EAT - H -GULHA-PIECE' } });
    expect(screen.getByLabelText('Article name for Handoo Gulha')).toHaveAttribute('placeholder', 'FROZEN - SHORT EAT - HANDOO GULHA-PIECE');

    saveShopBoxLabel.mockResolvedValue({ data: { ...prefill } });
    fireEvent.click(screen.getByTestId('box-save-shop'));
    await waitFor(() => expect(saveShopBoxLabel).toHaveBeenCalled());
    const [id, body] = saveShopBoxLabel.mock.calls[0];
    expect(id).toBe(7);
    expect(body).toMatchObject({ boat: 'MGH 14', pickup: 'T Jetty', when2: '8:00 AM – 2:00 PM' });
    expect(body.items).toEqual([
      { id: 1, article: 'FROZEN - SHORT EAT - MASROSHI-PIECE' },
      { id: 2, article: 'FROZEN - SHORT EAT - BAJIYAA-PIECE' },
      { id: 3, article: 'FROZEN - SHORT EAT - H -GULHA-PIECE' },
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Next time pick NH Kuda Rah');

    // Printing sends each line's article name.
    boxLabelLinks.mockResolvedValue({ url: '/x', view_url: '/x', pdf_url: '/x.pdf', expires_in_minutes: 30 });
    fireEvent.click(screen.getByTestId('box-prepare'));
    await waitFor(() => expect(boxLabelLinks).toHaveBeenCalled());
    expect(boxLabelLinks.mock.calls[0][0].lines[1]).toEqual({ id: 2, qty: 0, article: 'FROZEN - SHORT EAT - BAJIYAA-PIECE' });
  });

  it('opened from a delivery fills from it, shop and all', async () => {
    fetchDeliveryBoxLabel.mockResolvedValue({ data: { ...prefill, delivery: 5, delivery_number: 'TD-5', lines: [{ ...prefill.lines[1], qty: 40 }] } });
    render(<MemoryRouter><BoxLabelPanel deliveryId={5} /></MemoryRouter>);
    expect(await screen.findByDisplayValue('Seamaster 17')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity of Bajiya (0 to write by hand)')).toHaveValue(40);
    expect(screen.queryByLabelText(/Delivery \(optional/)).not.toBeInTheDocument();
    expect(screen.getByTestId('box-save-shop')).toBeInTheDocument();
  });
});
