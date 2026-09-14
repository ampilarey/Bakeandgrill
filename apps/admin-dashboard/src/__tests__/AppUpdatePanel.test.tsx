import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppUpdatePanel } from '../components/AppUpdatePanel';
import { AppUpdateBanner } from '../components/AppUpdateBanner';
import { AppUpdateContext, IDLE_APP_UPDATE, type AppUpdateContextValue } from '../hooks/appUpdateContext';

/*
 * Owner, 2026-09-14: "enhance the mobile pwa for admin, data base update
 * option, admin app update option etc. Same as pos."
 */

const local = { version: '1.0.0', build: '2026-09-14-120000-abc1234', commit: 'abc1234', built_at: '2026-09-14T12:00:00.000Z' };
const newer = { version: '1.0.0', build: '2026-09-14-150000-def5678', commit: 'def5678', built_at: '2026-09-14T15:00:00.000Z' };

function show(overrides: Partial<AppUpdateContextValue> = {}) {
  const value: AppUpdateContextValue = {
    ...IDLE_APP_UPDATE,
    localBuild: local,
    checkNow: vi.fn().mockResolvedValue(false),
    requestManualUpdate: vi.fn().mockResolvedValue('current'),
    applyUpdate: vi.fn().mockResolvedValue({ ok: true }),
    dismissBanner: vi.fn(),
    hardReset: vi.fn().mockResolvedValue(undefined),
    refreshData: vi.fn(),
    ...overrides,
  };
  render(
    <AppUpdateContext.Provider value={value}>
      <AppUpdateBanner />
      <AppUpdatePanel />
    </AppUpdateContext.Provider>,
  );
  return value;
}

describe('The admin app panel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('says which build this device is on', () => {
    show();

    expect(screen.getByTestId('app-local-build')).toHaveTextContent('v1.0.0 · 120000-abc1234');
    expect(screen.getByTestId('app-server-build')).toHaveTextContent('—');
  });

  it('checks the server on request and says what it found', async () => {
    const v = show({ checkNow: vi.fn().mockResolvedValue(true) });

    fireEvent.click(screen.getByRole('button', { name: /Check for update/ }));

    await waitFor(() => expect(v.checkNow).toHaveBeenCalledWith({ force: true }));
    expect(await screen.findByText(/A newer admin is on the server/)).toBeInTheDocument();
  });

  it('marks the server build as newer and offers Update app', () => {
    show({ serverBuild: newer, updateAvailable: true });

    expect(screen.getByTestId('app-server-build')).toHaveTextContent('150000-def5678');
    expect(screen.getByTestId('app-server-build')).toHaveTextContent('newer');
    expect(screen.getByRole('button', { name: 'Update app' })).toBeInTheDocument();
  });

  it('reloads onto the latest build when Update app is tapped', async () => {
    const v = show({ requestManualUpdate: vi.fn().mockResolvedValue('applying') });

    fireEvent.click(screen.getByRole('button', { name: /Update app/ }));

    await waitFor(() => expect(v.requestManualUpdate).toHaveBeenCalled());
    expect(await screen.findByText(/Reloading onto the latest build/)).toBeInTheDocument();
  });

  it('reloads the data on the page without reloading the app', () => {
    // The POS's "Refresh data": owner, "data base update option".
    const v = show();

    fireEvent.click(screen.getByTestId('app-reload-data'));

    expect(v.refreshData).toHaveBeenCalled();
    expect(screen.getByText('Data reloaded from the server.')).toBeInTheDocument();
  });

  it('asks before clearing the cached app', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const v = show();

    fireEvent.click(screen.getByTestId('app-hard-reset'));

    expect(confirm).toHaveBeenCalled();
    expect(v.hardReset).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('explains how to put it on the home screen when it is not there yet', () => {
    show();

    expect(screen.getByText(/Add to home screen/)).toBeInTheDocument();
  });
});

describe('The update banner', () => {
  it('stays out of the way until there is something newer', () => {
    show();

    expect(screen.queryByTestId('admin-update-banner')).toBeNull();
  });

  it('offers Update now and Later when there is', () => {
    const v = show({ serverBuild: newer, updateAvailable: true, bannerVisible: true });

    const banner = screen.getByTestId('admin-update-banner');
    expect(banner).toHaveTextContent('A newer admin is ready');
    expect(banner).toHaveTextContent('New build 150000-def5678 (yours 120000-abc1234)');

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(v.dismissBanner).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(v.applyUpdate).toHaveBeenCalled();
  });
});
