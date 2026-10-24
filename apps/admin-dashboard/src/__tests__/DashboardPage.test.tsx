import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The dashboard (owner, 2026-10-25: "Can u enhance layout and all related to dash board"):
 * today's sales with last week beside them, the floor right now from the till's own Active
 * orders (not every order in seven statuses, first 50), open shifts from every till (not the
 * signed-in person's own), alerts only when they hold something, and plain words throughout.
 */
const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const day = (date: string) => ({
  revenue: date === iso ? 4820.5 : 4300, orders: date === iso ? 63 : 58, avg_order: 76.5, net_profit: 1210.3, tax: 410.2,
  expenses: 300, waste_cost: 45, refunds: 25, discounts: 60, purchases: 0,
  by_type: [{ type: 'dine_in', count: 30, revenue: 2100 }, { type: 'online_pickup', count: 8, revenue: 820.5 }],
  top_items: [{ name: 'Bajiya', qty: 120, revenue: 600 }],
});
const order = (id: number, status: string, type: string, staff: boolean) => ({
  id, order_number: `B${id}`, status, type, user: staff ? { id: 2, name: 'Aisha' } : null, total: 100, created_at: new Date().toISOString(), items: [],
});

const api = vi.hoisted(() => ({
  fetchOrders: vi.fn(), fetchLowStockItems: vi.fn(), fetchSalesSummary: vi.fn(), getCurrentShift: vi.fn(), getDailySummary: vi.fn(),
  getInventoryForecast: vi.fn(), getPurchaseSuggestions: vi.fn(), getRestockPlan: vi.fn(), getSpendHub: vi.fn(), getSystemHealth: vi.fn(),
  systemHealthComponentLabel: (c: { status?: string } | undefined) => c?.status ?? '', fetchPosOverview: vi.fn(), formatAuditAction: (a: string) => a,
  fetchMaintenancePreview: vi.fn(), cleanupStaleTickets: vi.fn(), fetchPrintJobs: vi.fn(), fetchSmsLogStats: vi.fn(), fetchPriceChanges: vi.fn(),
  fetchPayables: vi.fn(), getCreditExposureReport: vi.fn(), fetchSiteStats: vi.fn(),
}));
vi.mock('../api', () => api);
vi.mock('../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ user: null, loading: false, can: () => true }) }));
vi.mock('../hooks/useInbox', () => ({ useInbox: () => ({ rows: [], loaded: true }) }));
vi.mock('../components/SiteStatsSection', () => ({ SiteStatsSection: () => null }));
vi.mock('../utils/audio', () => ({ playChime: vi.fn() }));
vi.mock('../utils/notifications', () => ({ pushNotification: vi.fn() }));

import { DashboardPage, methodWord, statusWord, typeWord, versus } from '../pages/DashboardPage';

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const overview = (shifts: { id: number; user_name: string; device_name: string; opened_at: string; opening_cash: number }[]) => ({
  open_shifts_count: shifts.length, open_shifts: shifts, active_tickets: 3, pending_devices: 0, today_voids: 1, today_refunds: 0,
  clocked_in_count: 4, clocked_in: [], recent_activity: [],
});

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDailySummary.mockImplementation(async (date: string) => day(date));
    api.fetchSalesSummary.mockResolvedValue({ service_charge_total: 210, delivery_fee_total: 75, payments: { cash: 1800, customer_deposit: 120, house_account: 300 } });
    api.getCreditExposureReport.mockResolvedValue({ total_balance: 0, customers_count: 0 });
    // 64 open on the till, the first page here; one waiting online, one cooking, one ready to collect.
    api.fetchOrders.mockResolvedValue({ data: [order(1, 'pending', 'online_pickup', false), order(2, 'in_progress', 'dine_in', true), order(3, 'ready', 'online_pickup', false)], meta: { current_page: 1, last_page: 1, total: 64 } });
    api.fetchLowStockItems.mockResolvedValue({ data: [] });
    api.getInventoryForecast.mockResolvedValue({ items: [] });
    api.getPurchaseSuggestions.mockResolvedValue({ items: [], by_supplier: [] });
    api.getRestockPlan.mockResolvedValue({ items: [], totals: { due_soon: 0, with_open_po: 0, open_alerts: 0 } });
    api.getSpendHub.mockResolvedValue({ totals: { purchases: 0, expenses_approved: 0, waste_cost: 0, total_with_waste: 0 } });
    api.getCurrentShift.mockResolvedValue({ shift: null });
    api.fetchPriceChanges.mockResolvedValue({ summary: { up_over_10: 0 } });
    api.fetchPayables.mockResolvedValue({ total_owed: 0 });
    api.fetchPrintJobs.mockResolvedValue({ data: [], meta: { total: 0 } });
    api.fetchSmsLogStats.mockResolvedValue({ total: 14, sent: 14, failed: 0, by_type: {} });
    api.getSystemHealth.mockResolvedValue({ status: 'ok', environment: 'production', timestamp: new Date().toISOString() });
    api.fetchPosOverview.mockResolvedValue(overview([{ id: 9, user_name: 'Aisha', device_name: 'Till 1', opened_at: new Date(Date.now() - 3600_000).toISOString(), opening_cash: 500 }]));
    api.fetchMaintenancePreview.mockResolvedValue({ older_than_days: 1, cutoff: '', open_tickets_total: 0, eligible_count: 0, skipped_count: 0, eligible_sample: [], skipped_sample: [], stale_shifts_count: 0, stale_shifts: [] });
  });

  it("puts today's sales first, beside the same day last week", async () => {
    renderPage();
    const todayBox = await screen.findByTestId('dash-today');
    await waitFor(() => expect(within(todayBox).getByText('MVR 4820.50')).toBeInTheDocument());
    expect(todayBox).toHaveTextContent('Every paid order counts, whatever stage it is at.');
    expect(todayBox).not.toHaveTextContent(/completed/i);
    await waitFor(() => expect(todayBox).toHaveTextContent(/MVR 4300\.00/));
    expect(within(screen.getByTestId('dash-today-more')).getByText('14')).toBeInTheDocument();
    expect(api.getDailySummary).toHaveBeenCalledTimes(2);
  });

  it("counts the till's own open orders, all of them, with cooking that includes in progress", async () => {
    renderPage();
    const now = await screen.findByTestId('dash-now');
    await waitFor(() => expect(within(now).getByText('64')).toBeInTheDocument());
    expect(api.fetchOrders).toHaveBeenCalledWith(expect.objectContaining({ active_only: true }));
    expect(now).toHaveTextContent('1 waiting · 1 cooking · 1 ready');
    expect(now).toHaveTextContent('Online, not started');
    expect(now).toHaveTextContent('Ready to collect');
    expect(screen.getByText('3 of 64')).toBeInTheDocument();
  });

  it("shows every open till's shift, and warns only when none is open", async () => {
    renderPage();
    const now = await screen.findByTestId('dash-now');
    await waitFor(() => expect(now).toHaveTextContent('Shifts open'));
    expect(now).toHaveTextContent('Aisha');
    expect(screen.queryByText(/No shift is open/)).toBeNull();
  });

  it('warns when no till at all has a shift open', async () => {
    api.fetchPosOverview.mockResolvedValue(overview([]));
    renderPage();
    expect(await screen.findByText(/No shift is open, so the cash drawer is not being counted/)).toBeInTheDocument();
  });

  it('lists alerts only when they hold something', async () => {
    renderPage();
    await screen.findByTestId('dash-now');
    expect(screen.queryByTestId('dash-alerts')).toBeNull();
  });

  it('shows alerts with something in them, in plain words', async () => {
    api.fetchPayables.mockResolvedValue({ total_owed: 19426.73 });
    api.fetchSmsLogStats.mockResolvedValue({ total: 15, sent: 14, failed: 1, by_type: {} });
    renderPage();
    const alerts = await screen.findByTestId('dash-alerts');
    await waitFor(() => expect(alerts).toHaveTextContent('Owed to suppliers'));
    expect(alerts).toHaveTextContent('MVR 19426.73');
    expect(alerts).toHaveTextContent('Texts that failed');
  });

  it('names payment methods, order types and statuses as the till does', async () => {
    renderPage();
    const breakdown = await screen.findByTestId('dash-breakdown');
    await waitFor(() => expect(breakdown).toHaveTextContent('Wallet'));
    expect(breakdown).toHaveTextContent('Credit account');
    expect(breakdown).toHaveTextContent('Dine in');
    expect(breakdown).toHaveTextContent('Pickup');
    expect(methodWord('bml')).toBe('BML online');
    expect(typeWord('online_pickup')).toBe('Pickup');
    expect(statusWord('in_progress')).toBe('Cooking');
    expect(versus(110, 100)).toEqual({ value: '+10% on last week', positive: true });
    expect(versus(100, 0)).toBeUndefined();
  });
});
