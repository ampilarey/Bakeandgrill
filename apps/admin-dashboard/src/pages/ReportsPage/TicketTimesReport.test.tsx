import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketTimesReport as Report } from '../../api';

/* Owner, 2026-11-07: "Will the site record time for each ticket and can admin view that?" → "Both". */
const api = vi.hoisted(() => ({ fetchTicketTimes: vi.fn() }));
vi.mock('../../api', () => api);
const csv = vi.hoisted(() => ({ downloadCSV: vi.fn() }));
vi.mock('../../utils/csvExport', () => csv);

import { TicketTimesReport } from './TicketTimesReport';

const stage = (median: number | null, count = 2) => ({ count: median === null ? 0 : count, avg: median, median, p90: median === null ? null : median + 5, max: median === null ? null : median + 10 });
const group = (key: string, extra: Partial<Report['by_type'][number]> = {}) => ({ key, tickets: 2, to_kitchen: 2, cooking: 15, handover: 3, to_pay: 25, total: 31, ...extra });

const report = (): Report => ({
  range: { from: '2026-11-07', to: '2026-11-07' },
  tickets: 2,
  stages: { to_kitchen: stage(3), cooking: stage(15), handover: stage(4), to_pay: stage(25), total: stage(31) },
  left_out: { to_kitchen: 0, cooking: 1, handover: 0, to_pay: 0, total: 0 },
  max_minutes: 720,
  by_day: [group('2026-11-07')],
  by_hour: [group('12')],
  by_type: [group('dine_in'), group('takeaway', { tickets: 1 })],
  by_staff: [group('9', { name: 'Mariyam' })],
  slowest: [{ id: 41, order_number: 'BG-1041', type: 'takeaway', at: '2026-11-07T12:00:00+05:00', who: 'Ahmed', staff: 'Mariyam', to_kitchen: 4, cooking: 20, handover: 10, to_pay: 30, total: 40 }],
  type_choices: ['dine_in', 'takeaway'],
  staff_choices: [{ id: 9, name: 'Mariyam' }],
});

function renderAt(url = '/reports?tab=Ticket+Times&from=2026-11-07&to=2026-11-07') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TicketTimesReport /></QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('TicketTimesReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchTicketTimes.mockImplementation(async () => report());
  });

  it('shows each stage as typical, average, slow and longest', async () => {
    renderAt();
    const cooking = await screen.findByTestId('ticket-stage-cooking', {}, { timeout: 5000 });
    expect(api.fetchTicketTimes).toHaveBeenCalledWith({ from: '2026-11-07', to: '2026-11-07', type: null, user_id: null });
    expect(cooking).toHaveTextContent('Cooking');
    expect(cooking).toHaveTextContent('15 min');
    expect(cooking).toHaveTextContent(/Average 15 min · slow 20 min · longest 25 min/);
    expect(screen.getByTestId('ticket-times-count')).toHaveTextContent('2 tickets');
    expect(screen.getByText(/Left out: stages over 12 h/)).toBeInTheDocument();
  });

  it('lists the slowest tickets, each opening its order, and the cashiers', async () => {
    renderAt();
    const slow = await screen.findByTestId('ticket-times-slowest', {}, { timeout: 5000 });
    const link = within(slow).getByRole('link', { name: '#BG-1041' });
    expect(link).toHaveAttribute('href', '/orders?order=41');
    expect(slow).toHaveTextContent('Takeaway · Ahmed · Mariyam');
    expect(slow).toHaveTextContent('40 min');
    expect(screen.getByTestId('ticket-times-staff')).toHaveTextContent('Mariyam');
  });

  it('filters by order type and exports the slowest tickets', async () => {
    renderAt();
    await screen.findByTestId('ticket-times-slowest', {}, { timeout: 5000 });
    fireEvent.change(screen.getByLabelText('Order type'), { target: { value: 'takeaway' } });
    await waitFor(() => expect(api.fetchTicketTimes).toHaveBeenLastCalledWith({ from: '2026-11-07', to: '2026-11-07', type: 'takeaway', user_id: null }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(csv.downloadCSV).toHaveBeenCalledWith('ticket-times-2026-11-07-to-2026-11-07', [expect.objectContaining({ Order: 'BG-1041', 'Whole ticket (min)': 40 })]);
  });
});
