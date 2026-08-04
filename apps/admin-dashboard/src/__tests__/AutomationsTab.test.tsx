import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AutomationsTab } from '../pages/SmsPage/AutomationsTab';
import { isAutomationEnabled } from '../pages/SmsPage/automationSettings';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

describe('isAutomationEnabled', () => {
  it('returns false for undefined — unknown is not on', () => {
    expect(isAutomationEnabled(undefined)).toBe(false);
  });

  it('returns true for 1/true and false for 0/false', () => {
    expect(isAutomationEnabled('1')).toBe(true);
    expect(isAutomationEnabled('true')).toBe(true);
    expect(isAutomationEnabled('0')).toBe(false);
    expect(isAutomationEnabled('false')).toBe(false);
  });
});

describe('AutomationsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'fetchStaffNotificationLogs').mockResolvedValue({
      data: [],
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
    } as Awaited<ReturnType<typeof api.fetchStaffNotificationLogs>>);
  });

  it('shows an error and hides enabled toggles when settings fail to load', async () => {
    vi.spyOn(api, 'getSiteSettings').mockRejectedValue(new Error('network down'));

    renderWithRouter(<AutomationsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('automations-settings-error')).toBeTruthy();
    });
    expect(screen.getByText(/Could not load automation settings/i)).toBeTruthy();
    expect(screen.queryByTestId('automations-toggles')).toBeNull();
    expect(screen.queryByTestId('automation-toggle-staff_sms_new_order_enabled')).toBeNull();
  });

  it('treats a genuinely absent key as enabled after a successful load', async () => {
    // Successful response with no staff_sms_* keys — server default is ON.
    vi.spyOn(api, 'getSiteSettings').mockResolvedValue({
      settings: { general: [] },
    } as unknown as Awaited<ReturnType<typeof api.getSiteSettings>>);

    renderWithRouter(<AutomationsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('automations-toggles')).toBeTruthy();
    });
    const toggle = screen.getByTestId('automation-toggle-staff_sms_new_order_enabled');
    expect(toggle.getAttribute('data-enabled')).toBe('1');
  });

  it('renders an explicitly disabled key as off after a successful load', async () => {
    vi.spyOn(api, 'getSiteSettings').mockResolvedValue({
      settings: {
        notifications: [
          { key: 'staff_sms_new_order_enabled', value: '0', type: 'boolean', label: 'New Order', description: null },
        ],
      },
    } as unknown as Awaited<ReturnType<typeof api.getSiteSettings>>);

    renderWithRouter(<AutomationsTab />);

    await waitFor(() => {
      expect(screen.getByTestId('automation-toggle-staff_sms_new_order_enabled')).toBeTruthy();
    });
    expect(
      screen.getByTestId('automation-toggle-staff_sms_new_order_enabled').getAttribute('data-enabled'),
    ).toBe('0');
  });
});
