import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '../api';
import { SettingsPage } from '../pages/SettingsPage';

/*
 * Manager walk, 2026-10-08: the site settings read was refused for a manager,
 * so every customer SMS switch read "on" whatever was set, and the one
 * refusal also blanked the templates and the staff alerts beside them.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));

function renderNotifications() {
  return render(
    <MemoryRouter initialEntries={['/settings/notifications']}>
      <Routes>
        <Route path="/settings/*" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Settings → Notifications when the switches do not load', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getSiteSettings').mockRejectedValue(new Error('You do not have permission to perform this action.'));
    vi.spyOn(api, 'fetchSmsTemplates').mockResolvedValue({ templates: [] });
    vi.spyOn(api, 'getOpsAlertsSettings').mockResolvedValue({
      settings: {
        shift_open_alert_hours: 12,
        shift_variance_alert_mvr: 40,
        unstarted_order_alert_minutes: 8,
        delivery_delay_alert_sms: true,
        inventory_reorder_alert_sms: true,
      },
    });
    vi.spyOn(api, 'updateSiteSettings').mockResolvedValue();
  });

  it('locks the customer switches and still loads the staff alerts', async () => {
    renderNotifications();

    expect(await screen.findByText(/current switches did not load/)).toBeInTheDocument();
    const switches = screen.getAllByRole('switch', { name: /^Toggle / });
    expect(switches.length).toBeGreaterThan(0);
    switches.forEach((sw) => expect(sw).toBeDisabled());
    // The staff alerts loaded on their own: the saved 12 hours, not the default 14.
    await waitFor(() => expect(screen.getByDisplayValue('12')).toBeInTheDocument());
    expect(api.updateSiteSettings).not.toHaveBeenCalled();
  });
});
