import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteAnalytics } from '../api';

/*
 * Website visitors (owner, 2026-10-24: "Add maximum detail u can get"): the
 * totals against the period before, the live count, the funnel, the lists in
 * plain words, the period and app pickers, and "Don't count this device".
 */
const api = vi.hoisted(() => ({ fetchSiteAnalytics: vi.fn(), setVisitRetention: vi.fn(), deleteVisitDetail: vi.fn() }));
vi.mock('../api', () => api);
const perms = vi.hoisted(() => ({ settings: true }));
vi.mock('../hooks/usePermissions', () => ({ useCurrentUserPermissions: () => ({ user: null, loading: false, can: (p: string) => p !== 'settings.update' || perms.settings }) }));

import VisitorsPage, { duration, pageName } from '../pages/VisitorsPage';

const totals = { views: 120, visitors: 40, sessions: 50, pages_per_session: 2.4, avg_session_s: 95, avg_view_s: 38, bounce_rate: 35.5, returning_rate: 20 };
const report = (): SiteAnalytics => ({
  range: { from: '2026-10-18', to: '2026-10-24', days: 7, surface: 'all' },
  totals,
  previous: { ...totals, visitors: 20, bounce_rate: 40 },
  live: { visitors: 3, views: 5, pages: [{ path: '/order/menu', visitors: 2 }] },
  daily: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${18 + i}`, views: 10 + i, visitors: i === 6 ? 12 : 4, sessions: 5 })),
  hours: Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_, h) => (h === 20 ? 9 : 0))),
  pages: [{ path: '/order/menu', views: 60, visitors: 30, avg_s: 72 }, { path: '/menu/c/hedhika', views: 20, visitors: 10, avg_s: 15 }],
  entries: [{ path: '/', sessions: 30 }],
  exits: [{ path: '/order/orders/:id', sessions: 6 }],
  sources: [{ name: 'Facebook', hosts: ['l.facebook.com'], sessions: 18 }, { name: 'Direct or app', hosts: [], sessions: 25 }],
  campaigns: [{ source: 'facebook', medium: 'paid', campaign: 'ramadan', sessions: 9 }],
  devices: [{ name: 'mobile', visitors: 35, views: 100 }, { name: 'desktop', visitors: 5, views: 20 }],
  browsers: [{ name: 'Facebook app', visitors: 12, views: 30 }],
  systems: [{ name: 'iOS', visitors: 25, views: 80 }],
  countries: [{ name: 'MV', visitors: 36, views: 110 }, { name: null, visitors: 4, views: 10 }],
  languages: [{ name: 'dv-mv', visitors: 10, views: 30 }],
  apps: [{ name: 'order', visitors: 30, views: 90 }],
  screens: [{ name: 'Phone (under 768 px)', visitors: 35 }],
  funnel: [{ key: 'visit', label: 'Visited', sessions: 50 }, { key: 'menu', label: 'Looked at the menu', sessions: 30 }, { key: 'order_app', label: 'Opened the order app', sessions: 25 }, { key: 'checkout', label: 'Reached checkout', sessions: 10 }, { key: 'ordered', label: 'Placed an order', sessions: 6 }],
  storage: { views: 1_250_000, oldest: '2026-03-01', approx_mb: 500.7, large: false, keep_days: 0, choices: [0, 90, 180, 365, 730] },
  recent: [{ at: '2026-10-24T15:00:00+05:00', surface: 'order', visit: 'a1b2', path: '/order/checkout', source: 'Facebook', device: 'mobile', browser: 'Facebook app', os: 'Android', country: 'MV', returning: true, duration_s: 64 }],
});

describe('VisitorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('bg_no_track');
    perms.settings = true;
    api.fetchSiteAnalytics.mockResolvedValue(report());
    api.setVisitRetention.mockResolvedValue({ storage: { ...report().storage, keep_days: 365 } });
    api.deleteVisitDetail.mockResolvedValue({ deleted: 4200, storage: report().storage });
  });

  it('shows the totals, the live count, the funnel and the lists in plain words', async () => {
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>);
    const totalsBox = await screen.findByTestId('visitors-totals');
    expect(api.fetchSiteAnalytics).toHaveBeenCalledWith({ days: 7, surface: 'all' });
    expect(within(totalsBox).getByText('40')).toBeInTheDocument();
    expect(within(totalsBox).getByText('+100%')).toBeInTheDocument();
    expect(within(totalsBox).getByText('1m 35s')).toBeInTheDocument();
    expect(within(totalsBox).getByText('Sat 24 Oct')).toBeInTheDocument();
    expect(screen.getByTestId('visitors-live')).toHaveTextContent('3 people on the site now');
    expect(screen.getByTestId('visitors-live')).toHaveTextContent('Order app menu (2)');
    expect(screen.getByTestId('visitors-funnel')).toHaveTextContent('Placed an order6 · 12%');
    expect(screen.getAllByText('Order app menu').length).toBeGreaterThan(0);
    expect(screen.getByText('Menu: hedhika')).toBeInTheDocument();
    expect(screen.getAllByText('Maldives').length).toBeGreaterThan(0);
    expect(screen.getByText('Dhivehi')).toBeInTheDocument();
    expect(screen.getByText('ramadan')).toBeInTheDocument();
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0);
  });

  it('reloads for another period and app', async () => {
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>);
    await screen.findByTestId('visitors-totals');
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(api.fetchSiteAnalytics).toHaveBeenLastCalledWith({ days: 30, surface: 'all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Order app' }));
    await waitFor(() => expect(api.fetchSiteAnalytics).toHaveBeenLastCalledWith({ days: 30, surface: 'order' }));
  });

  it('marks this device as not counted, kept in the browser', async () => {
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>);
    await screen.findByTestId('visitors-totals');
    fireEvent.click(screen.getByTestId('visitors-no-track'));
    expect(localStorage.getItem('bg_no_track')).toBe('1');
    fireEvent.click(screen.getByTestId('visitors-no-track'));
    expect(localStorage.getItem('bg_no_track')).toBeNull();
  });

  it('says so when nothing is recorded yet', async () => {
    api.fetchSiteAnalytics.mockResolvedValue({ ...report(), totals: { ...totals, views: 0 }, live: { visitors: 0, views: 0, pages: [] }, recent: [] });
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>);
    expect(await screen.findByText(/No visits recorded yet/)).toBeInTheDocument();
  });

  // Owner, 2026-10-24: kept for ever; "when data is large add manual del or auto del settings in the admin".
  it('shows how much is stored, sets an automatic delete and deletes before a date after asking', async () => {
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>);
    const card = await screen.findByTestId('visitors-storage');
    expect(within(card).getByTestId('visitors-storage-size')).toHaveTextContent('1,250,000 page views since 1 Mar 2026, about 500.7 MB. Kept for ever.');
    expect(within(card).queryByTestId('visitors-storage-large')).toBeNull();

    fireEvent.change(within(card).getByTestId('visitors-keep'), { target: { value: '365' } });
    await waitFor(() => expect(api.setVisitRetention).toHaveBeenCalledWith(365));

    expect(within(card).getByTestId('visitors-delete')).toBeDisabled();
    fireEvent.change(card.querySelector('input[type="date"]')!, { target: { value: '2026-06-01' } });
    fireEvent.click(within(card).getByTestId('visitors-delete'));
    expect(api.deleteVisitDetail).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Every page view before 1 June 2026 is deleted for good');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteVisitDetail).toHaveBeenCalledWith('2026-06-01'));
    expect(await screen.findByText('Deleted 4,200 page views from before 1 June 2026.')).toBeInTheDocument();
  });

  it('warns when the stored detail is large, and keeps the controls for those who can change settings', async () => {
    perms.settings = false;
    api.fetchSiteAnalytics.mockResolvedValue({ ...report(), storage: { ...report().storage, views: 3_000_000, approx_mb: 1201.6, large: true } });
    render(<MemoryRouter><VisitorsPage /></MemoryRouter>);
    const card = await screen.findByTestId('visitors-storage');
    expect(within(card).getByTestId('visitors-storage-large')).toBeInTheDocument();
    expect(within(card).getByTestId('visitors-storage-size')).toHaveTextContent('about 1.2 GB');
    expect(within(card).queryByTestId('visitors-delete')).toBeNull();
    expect(within(card).queryByTestId('visitors-keep')).toBeNull();
  });

  it('reads times and addresses plainly', () => {
    expect(duration(0)).toBe('0s');
    expect(duration(42)).toBe('42s');
    expect(duration(125)).toBe('2m 05s');
    expect(pageName('/')).toBe('Website home');
    expect(pageName('/dv/menu')).toBe('Website menu (Dhivehi)');
    expect(pageName('/order/orders/:id')).toBe('Order placed (order page)');
    expect(pageName('/somewhere')).toBe('/somewhere');
  });
});
