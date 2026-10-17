import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemHealthPage } from '../pages/SystemHealthPage';
import * as api from '../api';

describe('SystemHealthPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getCloneLiveToTestStatus').mockResolvedValue({ available: false });
    vi.spyOn(api, 'getSystemHealthDetailed').mockResolvedValue({
      status: 'degraded',
      deploy: {
        commit: 'abcdef0123456789abcdef0123456789abcdef01',
        commit_short: 'abcdef0',
        branch: 'main',
        deployed_at: '2026-08-11T06:00:00Z',
      },
      failed_jobs_24h: 2,
      webhook_failures_24h: 1,
      payment_pending_stuck: 1,
      sms_failed_24h: 0,
      print_proxy_ok: true,
      print_proxy_status: 'ok',
      queue_depth: 3,
      redis: { status: 'up', ok: true, latency_ms: 1.2, error: null },
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
      expect(screen.getByText('Redis')).toBeTruthy();
      expect(screen.getByText('Up')).toBeTruthy();
      expect(screen.getByText('Issues detected in the last 24 hours')).toBeTruthy();
      expect(screen.getByText('#1009')).toBeTruthy();
      expect(screen.getByTestId('deploy-stamp').textContent).toMatch(/Running abcdef0 on main, deployed/);
    });
  });

  it('lists the errors of the last 24 hours, marking payment ones', async () => {
    const base = await api.getSystemHealthDetailed();
    vi.spyOn(api, 'getSystemHealthDetailed').mockResolvedValue({
      ...base,
      errors_24h: 7,
      recent_errors: [{ id: 1, exception: 'BmlTimeout', message: 'cURL error 28', where: 'app/Domains/Payments/Bml.php:40', count: 7, payment: true, last_seen_at: new Date().toISOString() }],
    });
    render(
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    const list = await screen.findByTestId('health-recent-errors');
    expect(list.textContent).toContain('7× BmlTimeout');
    expect(list.textContent).toContain('Payment');
    expect(list.textContent).toContain('app/Domains/Payments/Bml.php:40');
    expect(screen.getByText('Errors')).toBeTruthy();
  });

  it('shows the system status with how to fix what fails', async () => {
    const base = await api.getSystemHealthDetailed();
    vi.spyOn(api, 'getSystemHealthDetailed').mockResolvedValue({
      ...base,
      ready: [
        { key: 'database', label: 'Database', status: 'pass', detail: 'Working.', fix: '' },
        { key: 'backup', label: 'Nightly backup', status: 'fail', detail: 'The last finished backup is 30 hours old.', fix: 'Run php artisan backup:run and check the scheduler.' },
      ],
    });
    render(
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    const backup = await screen.findByTestId('ready-backup');
    expect(backup.textContent).toContain('Fix');
    expect(backup.textContent).toContain('30 hours old');
    expect(backup.textContent).toContain('backup:run');
    expect(screen.getByTestId('ready-database').textContent).toContain('OK');
  });

  it('renders unknown deploy stamp when absent', async () => {
    vi.spyOn(api, 'getSystemHealthDetailed').mockResolvedValue({
      status: 'ok',
      deploy: { commit: 'unknown', commit_short: 'unknown', branch: 'unknown', deployed_at: 'unknown' },
      failed_jobs_24h: 0,
      webhook_failures_24h: 0,
      payment_pending_stuck: 0,
      sms_failed_24h: 0,
      print_proxy_ok: null,
      print_proxy_status: 'not_configured',
      queue_depth: 0,
      checked_at: new Date().toISOString(),
      recent_failed_jobs: [],
      recent_webhook_failures: [],
      stuck_payment_pending_orders: [],
    });

    render(
      <MemoryRouter>
        <SystemHealthPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('deploy-stamp').textContent).toBe(
        'Running unknown on unknown, deployed unknown',
      );
    });
  });
});
