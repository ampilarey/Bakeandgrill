import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import WholesaleInvoicingPage from '../pages/WholesaleInvoicingPage';
import { renderWithRouter } from './testUtils';

/* Wholesale audit, 2026-09-26: a mismatch decision sets the billed quantity; disputed missing stock can be charged. */

const mockCan = vi.hoisted(() => vi.fn((slug: string) => slug === 'trade.invoice'));

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: mockCan, user: null, loading: false }),
}));

const deliveries = vi.hoisted(() => ([
  {
    id: 11, delivery_number: 'TD-11', status: 'reconciled', reconciled_at: '2026-09-20T09:00:00Z', stamped_value_laar: 50000,
    invoiceable_laar: 40000, has_mismatch: true, mismatch_blocking: true, missing_qty: 1, missing_blocking: false, missing_policy: 'write_off',
    lines: [
      { id: 101, item_name: 'Momo set', qty_sent: 10, counted_return_qty: 1, reported_sold_qty: 7, qty_sold: 8, qty_missing: 1, unit_price_laar: 5000, mismatch: true },
      { id: 102, item_name: 'Roll', qty_sent: 5, counted_return_qty: 0, reported_sold_qty: 5, qty_sold: 5, qty_missing: 0, unit_price_laar: 2000, mismatch: false },
    ],
  },
  {
    id: 12, delivery_number: 'TD-12', status: 'reconciled', reconciled_at: '2026-09-21T09:00:00Z', stamped_value_laar: 50000,
    invoiceable_laar: 35000, has_mismatch: false, mismatch_blocking: false, missing_qty: 1, missing_blocking: true, missing_policy: 'dispute', lines: [],
  },
]));

vi.mock('../api', () => ({
  fetchTradeAccounts: vi.fn().mockResolvedValue({ data: [] }),
  fetchTradeAccount: vi.fn().mockResolvedValue({ trade_account: { id: 1, shop_name: 'Island Mart', is_active: true, customer: { id: 9, name: 'Island Mart', phone: '7722001' } } }),
  fetchReadyToInvoice: vi.fn().mockResolvedValue({ data: deliveries }),
  previewTradeInvoice: vi.fn().mockResolvedValue({ preview: { total_laar: 0, sold_laar: 0, missing_laar: 0, blocked: [], lines: [] } }),
  raiseTradeInvoice: vi.fn(),
  resolveMismatch: vi.fn().mockResolvedValue({ delivery: { id: 11, delivery_number: 'TD-11', mismatch_blocking: false } }),
  waiveMissing: vi.fn(),
  chargeMissing: vi.fn().mockResolvedValue({ delivery: { id: 12, delivery_number: 'TD-12', missing_blocking: false } }),
  generateInvoicePdf: vi.fn(),
  sendInvoiceToCustomer: vi.fn(),
}));

import * as api from '../api';

function renderPage() {
  return renderWithRouter(
    <Routes><Route path="/wholesale/:id/invoicing" element={<WholesaleInvoicingPage />} /></Routes>,
    { route: '/wholesale/1/invoicing' },
  );
}

describe('WholesaleInvoicingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets the owner bill the shop count when resolving a mismatch', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve TD-11' }));
    expect(screen.getByTestId('resolve-line-101')).toBeInTheDocument();
    expect(screen.queryByTestId('resolve-line-102')).toBeNull();
    fireEvent.click(screen.getByLabelText('Shop says 7'));
    expect(screen.getByLabelText('Bill sold quantity for Momo set')).toHaveValue(7);
    fireEvent.change(screen.getByLabelText('Mismatch decision'), { target: { value: 'Their count; ours was wrong.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() => expect(api.resolveMismatch).toHaveBeenCalledWith(11, {
      decision: 'Their count; ours was wrong.',
      lines: [{ line_id: 101, sold_qty: 7 }],
    }));
  });

  it('refuses a billed quantity above what did not come back', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve TD-11' }));
    fireEvent.change(screen.getByLabelText('Bill sold quantity for Momo set'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Mismatch decision'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByText(/between 0 and 9/)).toBeInTheDocument();
    expect(api.resolveMismatch).not.toHaveBeenCalled();
  });

  it('can charge disputed missing stock instead of only waiving it', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Charge missing TD-12' }));
    expect(screen.getByText(/Bill the shop for the 1 that did not come back/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Charge reason'), { target: { value: 'They admitted it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Charge missing stock' }));
    await waitFor(() => expect(api.chargeMissing).toHaveBeenCalledWith(12, { reason: 'They admitted it.' }));
    expect(screen.getByRole('button', { name: 'Waive missing TD-12' })).toBeInTheDocument();
  });
});
