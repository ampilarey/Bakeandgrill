import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import { LogsTab } from '../pages/SmsPage/LogsTab';
import * as api from '../api';

/*
 * SMS audit, 2026-09-24: the log filters by the real types, searches,
 * totals the filter and exports it.
 */

const log = (over: Partial<api.SmsLog>): api.SmsLog => ({
  id: 1, to: '+9607000001', message: 'Friday deal', type: 'marketing_campaign', status: 'sent', encoding: 'gsm7',
  segments: 1, cost_estimate_mvr: '0.25', created_at: '2026-09-24T10:00:00+05:00', sent_at: '2026-09-24T10:00:01+05:00',
  type_label: 'Bulk campaign', category: 'marketing', customer_name: 'Aisha', ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchSmsLogs').mockResolvedValue({
    data: [log({ id: 1 }), log({ id: 2, type: 'auth_customer_otp', type_label: 'Customer login OTP', category: 'auth', message: '[redacted]', status: 'deferred', error_message: 'Quiet hours: will send at 08:00.' })],
    total: 2, current_page: 1, last_page: 1, per_page: 50,
    totals: { count: 2, segments: 2, cost_mvr: 0.5, by_status: { sent: 1, deferred: 1 } },
    types: [
      { key: 'marketing_campaign', label: 'Bulk campaign', category: 'marketing' },
      { key: 'auth_customer_otp', label: 'Customer login OTP', category: 'auth' },
    ],
  });
  vi.spyOn(api, 'exportSmsLogs').mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
});

describe('SMS LogsTab', () => {
  it('shows totals, real type labels and the reason a text was held', async () => {
    render(<LogsTab />);
    expect(await screen.findByTestId('sms-log-1')).toHaveTextContent('Bulk campaign');
    expect(screen.getByTestId('sms-log-1')).toHaveTextContent('Aisha');
    expect(screen.getByTestId('sms-log-2')).toHaveTextContent('Quiet hours: will send at 08:00.');
    expect(screen.getByTestId('sms-log-totals')).toHaveTextContent('MVR 0.50');
    expect(screen.getByTestId('sms-log-totals')).toHaveTextContent('2 segments');
  });

  it('sends the filters to the API and narrows the type list by category', async () => {
    render(<LogsTab />);
    await screen.findByTestId('sms-log-1');
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'marketing' } });
    const typeSelect = screen.getByLabelText('Type') as HTMLSelectElement;
    expect(Array.from(typeSelect.options).map((o) => o.textContent)).toEqual(['All types', 'Bulk campaign']);
    fireEvent.change(typeSelect, { target: { value: 'marketing_campaign' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'deferred' } });
    fireEvent.change(screen.getByLabelText('Search SMS log'), { target: { value: 'Aisha' } });
    fireEvent.click(screen.getByText('Filter'));
    await waitFor(() => expect(api.fetchSmsLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'marketing', type: 'marketing_campaign', status: 'deferred', q: 'Aisha', page: 1, per_page: 50,
    })));
  });

  it('opens narrowed to a campaign and widens again on Show all', async () => {
    render(<LogsTab initialFilters={{ campaign_id: 6 }} />);
    await screen.findByTestId('sms-log-1');
    expect(api.fetchSmsLogs).toHaveBeenLastCalledWith(expect.objectContaining({ campaign_id: 6 }));
    expect(screen.getByTestId('sms-log-campaign-chip')).toHaveTextContent('campaign #6');
    fireEvent.click(screen.getByText('Show all'));
    await waitFor(() => expect(api.fetchSmsLogs).toHaveBeenLastCalledWith(expect.not.objectContaining({ campaign_id: 6 })));
    expect(screen.queryByTestId('sms-log-campaign-chip')).toBeNull();
  });

  it('exports the current filter as CSV', async () => {
    const createUrl = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
    render(<LogsTab />);
    await screen.findByTestId('sms-log-1');
    fireEvent.change(screen.getByLabelText('Search SMS log'), { target: { value: 'deal' } });
    fireEvent.click(screen.getByText('Filter'));
    await waitFor(() => expect(api.fetchSmsLogs).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'deal' })));
    fireEvent.click(screen.getByText('Export CSV'));
    await waitFor(() => expect(api.exportSmsLogs).toHaveBeenCalledWith(expect.objectContaining({ q: 'deal' })));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:x'));
  });
});
