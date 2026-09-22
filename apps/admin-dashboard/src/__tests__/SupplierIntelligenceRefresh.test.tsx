import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SupplierIntelligencePage } from '../pages/SupplierIntelligencePage';

/*
 * Owner, 2026-09-22: "Refresh doesn't work."
 *
 * It reloaded the supplier performance figures only. The two things on
 * the screen — the "Owed to suppliers" card and the supplier list — were
 * left as they were, so after settling a supplier's orders the old total
 * stayed put and the button looked broken.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: (p: string) => ['suppliers.purchases', 'suppliers.manage', 'reports.financial'].includes(p),
    loading: false,
    user: null,
  }),
}));
vi.mock('../components/ItemSearch', () => ({ ItemSearch: () => null }));

const getSupplierPerformance = vi.fn();
const fetchSuppliers = vi.fn();
const fetchPayables = vi.fn();
const fetchLegacyPayables = vi.fn();

vi.mock('../api', () => ({
  getSupplierPerformance: (...a: unknown[]) => getSupplierPerformance(...a),
  fetchSuppliers: (...a: unknown[]) => fetchSuppliers(...a),
  fetchPayables: (...a: unknown[]) => fetchPayables(...a),
  fetchLegacyPayables: (...a: unknown[]) => fetchLegacyPayables(...a),
  settleLegacyPayables: vi.fn(),
  rateSupplier: vi.fn(),
  getPriceComparison: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  deleteSupplier: vi.fn(),
}));

const owing = {
  total_owed: 2192,
  orders: 8,
  suppliers: [{ supplier_id: 1, name: 'Bazaaru', owed: 2192, orders: 8, oldest_date: '2026-09-21', oldest_number: 'PO-1' }],
};
const clear = { total_owed: 0, orders: 0, suppliers: [] };
const noLegacy = { before: '2026-09-21', total: 0, orders: 0, suppliers: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getSupplierPerformance.mockResolvedValue({ suppliers: [] });
  fetchSuppliers.mockResolvedValue({ data: [] });
  fetchLegacyPayables.mockResolvedValue(noLegacy);
});

const mount = () => render(<MemoryRouter><SupplierIntelligencePage /></MemoryRouter>);

describe('Suppliers tab — Refresh', () => {
  it('reloads what is on the screen, not just the performance figures', async () => {
    // Owing on load, settled by the time Refresh is pressed.
    fetchPayables.mockResolvedValueOnce(owing).mockResolvedValue(clear);

    mount();

    await waitFor(() => expect(screen.getByText(/across 8 orders/)).toBeTruthy());
    expect(fetchPayables).toHaveBeenCalledTimes(1);
    expect(fetchSuppliers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('suppliers-refresh'));

    // The card catches up rather than sitting on a stale total.
    await waitFor(() => expect(screen.getByText(/Nothing owed/)).toBeTruthy());
    expect(screen.queryByText(/across 8 orders/)).toBeNull();

    // And everything the page shows was asked for again.
    expect(fetchPayables).toHaveBeenCalledTimes(2);
    expect(fetchLegacyPayables).toHaveBeenCalledTimes(2);
    expect(fetchSuppliers).toHaveBeenCalledTimes(2);
    expect(getSupplierPerformance).toHaveBeenCalledTimes(2);
  });

  it('survives a payables call that fails, so one bad response does not wedge the button', async () => {
    fetchPayables.mockResolvedValueOnce(owing).mockRejectedValue(new Error('nope'));

    mount();
    await waitFor(() => expect(screen.getByText(/across 8 orders/)).toBeTruthy());

    fireEvent.click(screen.getByTestId('suppliers-refresh'));

    await waitFor(() => expect(fetchSuppliers).toHaveBeenCalledTimes(2));
    expect(getSupplierPerformance).toHaveBeenCalledTimes(2);
  });
});
