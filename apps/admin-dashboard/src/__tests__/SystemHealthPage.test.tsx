import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemHealthPage } from '../pages/SystemHealthPage';
import * as api from '../api';

describe('SystemHealthPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getSystemHealthDetailed').mockResolvedValue({
      status: 'degraded',
      failed_jobs_24h: 2,
      webhook_failures_24h: 1,
      payment_pending_stuck: 1,
      sms_failed_24h: 0,
      print_proxy_ok: true,
      print_proxy_status: 'ok',
      queue_depth: 3,
      checked_at: new Date().toISOString(),
      recent_failed_jobs: [],
      recent_webhook_failures: [],
      stuck_payment_pending_orders: [{ id: 9, order_number: '1009', total: 45, created_at: new Date().toISOString() }],
    });
  });

  it('renders health signals from API', async () => {
    render(
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'System Health' })).toBeTruthy();
      expect(screen.getByText('Failed jobs')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('Issues detected in the last 24 hours')).toBeTruthy();
      expect(screen.getByText('#1009')).toBeTruthy();
    });
  });
});
