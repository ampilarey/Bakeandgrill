import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SettingsPage } from '../pages/SettingsPage';

vi.mock('../pages/SettingsPage/PermissionsSettingsSubPage', () => ({
  PermissionsSettings: () => <div data-testid="permissions-panel">permissions</div>,
}));

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname}{search}</div>;
}

describe('Settings routing', () => {
  it('redirects settings?tab=website to Content editors', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=website']}>
        <Routes>
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/content" element={<div data-testid="probe">content</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="probe"]')?.textContent).toBe('content');
    });
  });

  it('redirects legacy settings?tab=permissions to /settings/permissions', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=permissions']}>
        <Routes>
          <Route path="/settings/*" element={<><SettingsPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/settings/permissions');
      expect(document.querySelector('[data-testid="permissions-panel"]')).toBeTruthy();
    });
  });

  it('redirects bare /settings to /settings/permissions', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings/*" element={<><SettingsPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/settings/permissions');
    });
  });

  it('preserves ?user= when bouncing legacy permissions query', async () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=permissions&user=42']}>
        <Routes>
          <Route path="/settings/*" element={<><SettingsPage /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="loc"]')?.textContent).toBe('/settings/permissions?user=42');
    });
  });
});
