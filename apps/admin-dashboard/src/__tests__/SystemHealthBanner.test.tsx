import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * The failure this guards against already happened.
 *
 * On 2026-08-21 the scheduler and queue worker were both dead on production
 * and had been for an unknown time. The health checks were reporting it
 * correctly the whole while — it was rendered as a grey tile on the Dashboard,
 * visually identical to "Environment: production" beside it, on a page nobody
 * opens daily.
 *
 * So the thing worth testing is not "does the API say degraded" but "does a
 * person get told". Silence is the bug.
 */

const getSystemHealth = vi.fn();

vi.mock('../api', () => ({
  getSystemHealth: () => getSystemHealth(),
}));

const { SystemHealthBanner } = await import('../components/SystemHealthBanner');

function renderBanner() {
  return render(<SystemHealthBanner />);
}

const ok = { ok: true, status: 'ok' };

const healthy = {
  status: 'ok',
  environment: 'production',
  timestamp: new Date().toISOString(),
  database: ok,
  redis: ok,
  queue: ok,
  scheduler: ok,
  storage: ok,
};

describe('SystemHealthBanner', () => {
  // mockClear, not mockReset: under vitest 4 resetting a mock that returns
  // a promise detaches its rejection tracking, and a later rejected probe
  // surfaces as an unhandled rejection. Every test sets its own
  // implementation, so clearing call history is all that is needed.
  beforeEach(() => getSystemHealth.mockClear());

  it('says nothing while everything is running', async () => {
    // A banner that is always there is a banner nobody reads.
    getSystemHealth.mockResolvedValue(healthy);

    renderBanner();

    await waitFor(() => expect(getSystemHealth).toHaveBeenCalled());
    expect(screen.queryByTestId('system-health-banner')).toBeNull();
  });

  it('announces a dead scheduler, and what it costs', async () => {
    getSystemHealth.mockResolvedValue({
      ...healthy,
      status: 'degraded',
      scheduler: { ok: false, status: 'never_run', last_run_at: null },
    });

    renderBanner();

    const banner = await screen.findByTestId('system-health-banner');
    expect(banner).toHaveTextContent(/scheduler stopped/i);
    // Naming the consequence is the point — "scheduler: never_run" means
    // nothing to the person who has to act on it.
    expect(banner).toHaveTextContent(/scheduled sms/i);
  });

  it('announces a dead queue worker', async () => {
    getSystemHealth.mockResolvedValue({
      ...healthy,
      status: 'degraded',
      queue: { ok: false, status: 'stalled', last_run_at: null },
    });

    renderBanner();

    expect(await screen.findByTestId('system-health-banner')).toHaveTextContent(/queue stopped/i);
  });

  it('reports every broken component, not just the first', async () => {
    getSystemHealth.mockResolvedValue({
      ...healthy,
      status: 'degraded',
      scheduler: { ok: false, status: 'stale', last_run_at: null },
      queue: { ok: false, status: 'stalled', last_run_at: null },
    });

    renderBanner();

    const banner = await screen.findByTestId('system-health-banner');
    expect(banner).toHaveTextContent(/scheduler stopped/i);
    expect(banner).toHaveTextContent(/queue stopped/i);
  });

  it('says how long it has been broken', async () => {
    // "Last seen 3 hours ago" is what turns a status into an alarm.
    getSystemHealth.mockResolvedValue({
      ...healthy,
      status: 'degraded',
      scheduler: {
        ok: false,
        status: 'stale',
        last_run_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    });

    renderBanner();

    expect(await screen.findByTestId('system-health-banner')).toHaveTextContent(/3 hours ago/i);
  });

  it('stays quiet when health could not be read', async () => {
    // The component's queryFn catches a failed probe and returns null, so
    // "could not read health" and "health is fine" both reach the render as
    // no banner. Staff without permission to read health, and a momentary
    // blip, are both reasons to stay quiet rather than put a red bar across
    // everyone's screen.
    //
    // Asserted via a null payload rather than a throwing mock: vitest 4
    // reports a mock that throws as a test error even when the caller catches
    // it, which fails for a reason unrelated to the component. The catch in
    // SystemHealthBanner sets exactly this state.
    getSystemHealth.mockResolvedValue(null);

    renderBanner();

    await waitFor(() => expect(getSystemHealth).toHaveBeenCalled());
    expect(screen.queryByTestId('system-health-banner')).toBeNull();
  });

  it('treats a legacy string database probe as healthy', async () => {
    // Older payloads sent `database: "ok"` as a bare string. A string has no
    // ok flag; guessing it is broken would show a false alarm forever.
    getSystemHealth.mockResolvedValue({ ...healthy, database: 'ok' });

    renderBanner();

    await waitFor(() => expect(getSystemHealth).toHaveBeenCalled());
    expect(screen.queryByTestId('system-health-banner')).toBeNull();
  });
});
