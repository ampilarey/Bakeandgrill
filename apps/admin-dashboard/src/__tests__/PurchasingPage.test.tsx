import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PurchasingPage, PURCHASING_TABS, PURCHASING_PAGE_PERMISSIONS } from '../pages/PurchasingPage';

/*
 * The Purchasing hub replaced five sidebar entries and a settings screen.
 * What matters: each tab shows only to the permission the old page carried,
 * a bare /purchasing lands on the first tab the user can see, and the
 * Settings tab saves through the single purchasing-settings endpoint.
 */

let granted: string[] = [];
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    user: { id: 1, name: 'Test', email: 't@test.com', role: 'staff', permissions: granted },
    loading: false,
    can: (slug: string) => granted.includes(slug),
  }),
}));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

// The tab pages are the existing screens; they have their own tests.
vi.mock('../pages/PurchaseRequestsPage', () => ({ default: () => <div data-testid="tab-requests">requests</div> }));
vi.mock('../pages/PurchaseOrdersPage', () => ({ PurchaseOrdersPage: () => <div data-testid="tab-orders">orders</div> }));
vi.mock('../pages/ShoppingListsPage', () => ({ default: () => <div data-testid="tab-lists">lists</div> }));
vi.mock('../pages/SupplierIntelligencePage', () => ({ SupplierIntelligencePage: () => <div data-testid="tab-suppliers">suppliers</div> }));

vi.mock('../components/ui', () => ({
  Toggle: ({ label, checked, disabled, onChange }: { label?: string; checked: boolean; disabled?: boolean; onChange: (c: boolean) => void }) => (
    <button type="button" disabled={disabled} onClick={() => onChange(!checked)}>{label ?? (checked ? 'On' : 'Off')}</button>
  ),
}));

const settings = {
  auto_request_on_low_stock: false,
  recurring_lists_enabled: false,
  auto_approve_under_mvr: 0,
  show_price_hints: true,
  backdate_max_days: 7,
  stock_variance_reason_mvr: 100,
  auto_expense_on_verify: false,
  default_expense_category_id: null,
  auto_expense_non_stock_purchases: false,
  enforce_expense_budgets: false,
  restock_include_waste: false,
  restock_high_waste_pct: 15,
  reorder_alert_sms: false,
  expense_categories: [{ id: 3, name: 'Supplies' }],
};
const getPurchasingSettings = vi.fn();
const updatePurchasingSettings = vi.fn();
vi.mock('../api', () => ({
  getPurchasingSettings: (...a: unknown[]) => getPurchasingSettings(...a),
  updatePurchasingSettings: (...a: unknown[]) => updatePurchasingSettings(...a),
}));

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname}{search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/purchasing/*" element={<><PurchasingPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PurchasingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    granted = [];
    getPurchasingSettings.mockResolvedValue({ settings });
    updatePurchasingSettings.mockImplementation(async (patch: Partial<typeof settings>) => ({ settings: { ...settings, ...patch } }));
  });

  it('opens every tab for the page permissions, in work order, and lands on Requests', async () => {
    granted = [...PURCHASING_PAGE_PERMISSIONS];
    renderAt('/purchasing');

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/purchasing/requests'));
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(PURCHASING_TABS.map((t) => t.label));
    expect(tabs).toEqual(['Requests', 'Purchase orders', 'Shopping lists', 'Suppliers', 'Settings']);
    // Tab pages are lazy: they arrive after a Suspense tick.
    expect(await screen.findByTestId('tab-requests')).toBeInTheDocument();
  });

  it('shows a user only the tabs their permissions carry and lands on the first of them', async () => {
    granted = ['suppliers.view'];
    renderAt('/purchasing');

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/purchasing/suppliers'));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Suppliers']);
    expect(await screen.findByTestId('tab-suppliers')).toBeInTheDocument();
  });

  it('bounces a tab the user cannot see to one they can', async () => {
    granted = ['suppliers.purchases'];
    renderAt('/purchasing/settings');

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/purchasing/orders'));
    expect(await screen.findByTestId('tab-orders')).toBeInTheDocument();
  });

  it('switching tabs changes the URL, so each tab is a bookmarkable address', async () => {
    granted = [...PURCHASING_PAGE_PERMISSIONS];
    renderAt('/purchasing/requests');

    await screen.findByTestId('tab-requests');
    fireEvent.click(screen.getByRole('tab', { name: 'Shopping lists' }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/purchasing/lists'));
    expect(await screen.findByTestId('tab-lists')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shopping lists' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Settings shows the six stages and saves one switch through the purchasing endpoint', async () => {
    granted = ['settings.update'];
    renderAt('/purchasing/settings');

    await screen.findByTestId('purchasing-settings');
    for (const stage of ['1 · Requesting', '2 · Approving', '3 · Buying', '4 · Receiving and counting', '5 · Costing', '6 · Restocking']) {
      expect(screen.getByRole('heading', { name: stage })).toBeInTheDocument();
    }
    expect(getPurchasingSettings).toHaveBeenCalledTimes(1);

    // The category select is filled from the same response — no second fetch.
    expect(screen.getByRole('option', { name: 'Supplies' })).toBeInTheDocument();

    // Flip the first switch: one PATCH with just that key.
    const toggles = screen.getAllByRole('button', { name: 'Off' });
    fireEvent.click(toggles[0]);
    await waitFor(() => expect(updatePurchasingSettings).toHaveBeenCalledWith({ auto_request_on_low_stock: true }));
    await screen.findByRole('status');

    // A number field saves on blur, and only when it is inside its range.
    const backdate = screen.getByLabelText('Backdate window (days)') as HTMLInputElement;
    fireEvent.change(backdate, { target: { value: '30' } });
    fireEvent.blur(backdate);
    await waitFor(() => expect(updatePurchasingSettings).toHaveBeenCalledWith({ backdate_max_days: 30 }));

    fireEvent.change(backdate, { target: { value: '99999' } });
    fireEvent.blur(backdate);
    expect(updatePurchasingSettings).toHaveBeenCalledTimes(2);
    expect(backdate.value).toBe('30');
  });

  it('a viewer without settings.update sees the switches but cannot change them', async () => {
    granted = ['purchase_requests.view_all'];
    renderAt('/purchasing/settings');

    await screen.findByTestId('purchasing-settings');
    expect(screen.getByText(/You can see these but not change them/)).toBeInTheDocument();
    expect(screen.getByLabelText('Backdate window (days)')).toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: /^(On|Off)$/ })) expect(b).toBeDisabled();
  });

  it('puts a failed save back and says why', async () => {
    granted = ['settings.update'];
    updatePurchasingSettings.mockRejectedValueOnce(new Error('Server said no'));
    renderAt('/purchasing/settings');

    await screen.findByTestId('purchasing-settings');
    fireEvent.click(screen.getAllByRole('button', { name: 'Off' })[0]);
    await screen.findByText('Server said no');
    // Still Off: the optimistic flip was rolled back. Eight switches, one
    // (price hints) defaults On, so seven read Off — same as before the click.
    expect(screen.getAllByRole('button', { name: 'Off' })).toHaveLength(7);
  });
});
