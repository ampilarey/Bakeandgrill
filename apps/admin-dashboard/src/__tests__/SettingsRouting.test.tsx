import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SettingsPage } from '../pages/SettingsPage';

/*
 * Settings is a hub now (2026-09-08): eight tabs on /settings/<tab>. The
 * legacy ?tab= links from before the first settings clean-up still land.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../pages/SettingsPage/PermissionsSettingsSubPage', () => ({
  PermissionsSettings: ({ initialUserId }: { initialUserId: number | null }) => (
    <div data-testid="permissions-panel">permissions {initialUserId ?? 'nobody'}</div>
  ),
}));
vi.mock('../pages/BusinessDetailsPage', () => ({ default: () => <div data-testid="business-panel">business</div> }));
vi.mock('../pages/OnlineOrderingPage', () => ({ default: () => <div data-testid="ordering-panel">ordering</div> }));
vi.mock('../pages/DeliverySettingsPage', () => ({ default: () => <div data-testid="delivery-panel">delivery</div> }));

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname}{search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/*" element={<><SettingsPage /><LocationProbe /></>} />
        <Route path="/content/website" element={<div data-testid="probe">content</div>} />
        <Route path="/purchasing/*" element={<div data-testid="probe">purchasing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const loc = () => document.querySelector('[data-testid="loc"]')?.textContent;

describe('Settings routing', () => {
  it('redirects settings?tab=website to Content editors', async () => {
    renderAt('/settings?tab=website');
    await waitFor(() => {
      expect(document.querySelector('[data-testid="probe"]')?.textContent).toBe('content');
    });
  });

  it('redirects legacy settings?tab=permissions to /settings/permissions', async () => {
    renderAt('/settings?tab=permissions');
    await waitFor(() => {
      expect(loc()).toBe('/settings/permissions');
      expect(document.querySelector('[data-testid="permissions-panel"]')).toBeTruthy();
    });
  });

  it('preserves ?user= when bouncing legacy permissions query', async () => {
    renderAt('/settings?tab=permissions&user=42');
    await waitFor(() => {
      expect(loc()).toBe('/settings/permissions?user=42');
      expect(document.querySelector('[data-testid="permissions-panel"]')?.textContent).toBe('permissions 42');
    });
  });

  it('sends the old ordering and delivery query tabs to their hub tabs', async () => {
    renderAt('/settings?tab=ordering');
    await waitFor(() => expect(loc()).toBe('/settings/ordering'));
    // The tab page is lazy; give it a beat.
    await waitFor(() => expect(document.querySelector('[data-testid="ordering-panel"]')).toBeTruthy());
  });

  it('bare /settings lands on the first tab', async () => {
    renderAt('/settings');
    await waitFor(() => expect(loc()).toBe('/settings/business'));
    await waitFor(() => expect(document.querySelector('[data-testid="business-panel"]')).toBeTruthy());
  });

  it('the delivery settings, which had no sidebar entry, are a tab', async () => {
    renderAt('/settings/delivery');
    await waitFor(() => expect(document.querySelector('[data-testid="delivery-panel"]')).toBeTruthy());
    expect(loc()).toBe('/settings/delivery');
  });

  it('stock corrections still bounce to purchasing settings', async () => {
    renderAt('/settings/stock');
    await waitFor(() => {
      expect(document.querySelector('[data-testid="probe"]')?.textContent).toBe('purchasing');
    });
  });
});
