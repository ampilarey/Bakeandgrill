import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { SignagePage } from '../pages/SignagePage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../components/ui', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

const mockOverview: api.SignageOverview = {
  playlists: [
    {
      id: 1,
      name: 'Default Board',
      slides: [{ id: 's1', name: 'Hero', seconds: 12, weight: 1, transition: 'fade' }],
      theme: null,
      is_active: true,
    },
  ],
  groups: [
    {
      id: 10,
      name: 'Dining TVs',
      playlist_id: 1,
      theme: null,
      orientation: 'landscape',
      refresh_seconds: 120,
      playlist: { id: 1, name: 'Default Board' },
    },
  ],
  screens: [
    {
      id: 100,
      name: 'Main Dining',
      slug: 'default',
      group_id: 10,
      playlist_id: null,
      orientation: 'landscape',
      resolution: '1920x1080',
      refresh_seconds: 120,
      is_default: true,
      group: { id: 10, name: 'Dining TVs' },
    },
  ],
  campaigns: [],
  emergency: 'none',
  prayer: { enabled: true, prayers: ['fajr', 'dhuhr'], break_minutes: 15 },
  templates: [{ key: 'hero', label: 'Hero' }],
  custom_templates: [],
  wifi: { name: '', password: '' },
};

describe('SignagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, 'getSignageOverview').mockResolvedValue(mockOverview);
    vi.spyOn(api, 'fetchSignageDevices').mockResolvedValue({
      data: [
        {
          id: 1,
          device_id: 'pending-1',
          pairing_code: 'AB12CD',
          approved: false,
          screen_id: null,
          screen: null,
          last_seen_at: new Date().toISOString(),
          online: true,
          meta: {},
          queued_command: null,
        },
        {
          id: 2,
          device_id: 'ok-tv',
          pairing_code: null,
          approved: true,
          screen_id: 100,
          screen: { id: 100, name: 'Main Dining', slug: 'default' },
          last_seen_at: new Date().toISOString(),
          online: true,
          meta: { playlist_version: 'abc', current_slide: 's1', resolution: '1920x1080', build_version: '2.1', cache_status: 'ok' },
          queued_command: null,
        },
      ],
    });
    vi.spyOn(api, 'approveSignageDevice').mockResolvedValue({
      data: {
        id: 1,
        device_id: 'pending-1',
        pairing_code: null,
        approved: true,
        screen_id: 100,
        screen: { id: 100, name: 'Main Dining', slug: 'default' },
        last_seen_at: new Date().toISOString(),
        online: true,
        meta: {},
        queued_command: null,
      },
    });
  });

  it('renders studio with screens and emergency control', async () => {
    renderWithRouter(<SignagePage />);

    expect(await screen.findByTestId('signage-studio')).toBeTruthy();
    expect(await screen.findByTestId('signage-screen-default')).toBeTruthy();
    expect(screen.getByText(/Main Dining/)).toBeTruthy();
    expect(screen.getByText(/\/order\/tv\/default/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Emergency' }));

    await waitFor(() => {
      expect(screen.getByTestId('signage-emergency-panel')).toBeTruthy();
    });
    expect(screen.getByTestId('signage-emergency-select')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save emergency mode/i })).toBeTruthy();
  });

  it('loads device health and pending pairings', async () => {
    renderWithRouter(<SignagePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));

    expect(await screen.findByTestId('signage-devices-panel')).toBeTruthy();
    expect(await screen.findByTestId('signage-pending-1')).toBeTruthy();
    expect(screen.getByText('AB12CD')).toBeTruthy();
    const health = screen.getByTestId('signage-device-2');
    expect(health).toBeTruthy();
    expect(health.textContent).toMatch(/Online/);
    expect(health.textContent).toMatch(/1920x1080/);
  });
});
