import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { boardPixelSize, SignagePage } from '../pages/SignagePage';
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

  it('previews screens in a CSS-scaled full-resolution iframe with embed=1', async () => {
    renderWithRouter(<SignagePage />);

    const frame = await screen.findByTestId('signage-preview-frame-default') as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toMatch(/\/order\/tv\/default\?embed=1$/);
    expect(frame.style.width).toBe('1920px');
    expect(frame.style.height).toBe('1080px');
    expect(frame.style.transformOrigin).toMatch(/top/i);
    expect(frame.style.transform).toMatch(/scale\(/);
    expect(screen.getByTestId('signage-preview-default')).toBeTruthy();
  });

  it('boardPixelSize respects portrait orientation', () => {
    expect(boardPixelSize('1920x1080', 'landscape')).toEqual({ width: 1920, height: 1080 });
    expect(boardPixelSize('1920x1080', 'portrait')).toEqual({ width: 1080, height: 1920 });
    expect(boardPixelSize(null, null)).toEqual({ width: 1920, height: 1080 });
    expect(boardPixelSize('1080x1920', 'portrait')).toEqual({ width: 1080, height: 1920 });
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

  it('creates a screen from the screens tab form', async () => {
    const create = vi.spyOn(api, 'createSignageScreen').mockResolvedValue({
      data: {
        id: 101,
        name: 'Patio TV',
        slug: 'patio-tv',
        group_id: null,
        playlist_id: null,
        orientation: 'landscape',
        resolution: null,
        refresh_seconds: null,
        is_default: false,
      },
    });

    renderWithRouter(<SignagePage />);
    expect(await screen.findByTestId('signage-new-screen')).toBeTruthy();
    fireEvent.change(document.getElementById('signage-screen-name') as HTMLInputElement, { target: { value: 'Patio TV' } });
    fireEvent.click(screen.getByTestId('signage-create-screen'));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Patio TV',
        orientation: 'landscape',
      }));
    });
    expect(await screen.findByTestId('signage-screen-patio-tv')).toBeTruthy();
    expect(toastSuccess).toHaveBeenCalledWith('Screen created.');
  });

  it('creates a playlist and a group from their forms', async () => {
    const createPlaylist = vi.spyOn(api, 'createSignagePlaylist').mockResolvedValue({
      data: {
        id: 2,
        name: 'Lunch Board',
        slides: [],
        theme: null,
        is_active: true,
      },
    });
    const createGroup = vi.spyOn(api, 'createSignageGroup').mockResolvedValue({
      data: {
        id: 11,
        name: 'Patio Group',
        playlist_id: 2,
        theme: null,
        orientation: 'landscape',
        refresh_seconds: 120,
      },
    });

    renderWithRouter(<SignagePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(await screen.findByTestId('signage-new-playlist')).toBeTruthy();
    fireEvent.change(document.getElementById('signage-playlist-name') as HTMLInputElement, { target: { value: 'Lunch Board' } });
    fireEvent.click(screen.getByTestId('signage-create-playlist'));

    await waitFor(() => {
      expect(createPlaylist).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Lunch Board',
        slides: [],
        is_active: true,
      }));
    });
    expect(toastSuccess).toHaveBeenCalledWith('Playlist created.');

    fireEvent.click(screen.getByRole('button', { name: 'Screens & Groups' }));
    expect(await screen.findByTestId('signage-new-group')).toBeTruthy();
    fireEvent.change(document.getElementById('signage-group-name') as HTMLInputElement, { target: { value: 'Patio Group' } });
    fireEvent.click(screen.getByTestId('signage-create-group'));

    await waitFor(() => {
      expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Patio Group',
        orientation: 'landscape',
        refresh_seconds: 120,
      }));
    });
    expect(toastSuccess).toHaveBeenCalledWith('Group created.');
  });

  it('requires a name before creating a screen', async () => {
    const create = vi.spyOn(api, 'createSignageScreen');
    renderWithRouter(<SignagePage />);
    expect(await screen.findByTestId('signage-create-screen')).toBeTruthy();
    fireEvent.click(screen.getByTestId('signage-create-screen'));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Screen name is required.');
    });
    expect(create).not.toHaveBeenCalled();
  });

  async function openPlaylistsTab() {
    renderWithRouter(<SignagePage />);
    expect(await screen.findByTestId('signage-studio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(await screen.findByTestId('signage-new-playlist')).toBeTruthy();
  }

  it('deletes a slide and keeps remaining slides in order', async () => {
    vi.spyOn(api, 'getSignageOverview').mockResolvedValue({
      ...mockOverview,
      playlists: [{
        id: 1,
        name: 'Default Board',
        slides: [
          { id: 's1', name: 'Hero', seconds: 12, weight: 1, transition: 'fade' },
          { id: 's2', name: 'Menu', seconds: 10, weight: 1, transition: 'fade' },
          { id: 's3', name: 'Promo', seconds: 8, weight: 1, transition: 'fade' },
        ],
        theme: null,
        is_active: true,
      }],
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openPlaylistsTab();
    expect(await screen.findByTestId('signage-slide-0')).toBeTruthy();
    expect(screen.getByTestId('signage-slide-1').textContent).toMatch(/Menu/);
    expect(screen.getByTestId('signage-slide-2').textContent).toMatch(/Promo/);

    fireEvent.click(screen.getByTestId('signage-delete-1'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('Menu')).toBeNull();
    });
    expect(screen.getByTestId('signage-slide-0').textContent).toMatch(/Hero/);
    expect(screen.getByTestId('signage-slide-1').textContent).toMatch(/Promo/);
    expect(screen.queryByTestId('signage-slide-2')).toBeNull();
    expect(toastSuccess).toHaveBeenCalledWith('Slide removed — save playlist to publish.');
  });

  it('closes the designer when its slide is deleted', async () => {
    vi.spyOn(api, 'getSignageOverview').mockResolvedValue({
      ...mockOverview,
      playlists: [{
        id: 1,
        name: 'Default Board',
        slides: [
          { id: 's1', name: 'Hero', seconds: 12, weight: 1, transition: 'fade' },
          { id: 's2', name: 'Menu', seconds: 10, weight: 1, transition: 'fade' },
        ],
        theme: null,
        is_active: true,
      }],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openPlaylistsTab();
    fireEvent.click(await screen.findByTestId('signage-design-0'));
    expect(await screen.findByTestId('signage-designer-host')).toBeTruthy();

    fireEvent.click(screen.getByTestId('signage-delete-0'));
    await waitFor(() => {
      expect(screen.queryByTestId('signage-designer-host')).toBeNull();
    });
  });

  it('keeps the same designer slide open when a lower-index slide is deleted', async () => {
    vi.spyOn(api, 'getSignageOverview').mockResolvedValue({
      ...mockOverview,
      playlists: [{
        id: 1,
        name: 'Default Board',
        slides: [
          { id: 's1', name: 'Hero', seconds: 12, weight: 1, transition: 'fade' },
          { id: 's2', name: 'Menu', seconds: 10, weight: 1, transition: 'fade' },
          { id: 's3', name: 'Promo', seconds: 8, weight: 1, transition: 'fade' },
        ],
        theme: null,
        is_active: true,
      }],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openPlaylistsTab();
    // Open designer on Promo (index 2). Deleting Hero must decrement designIndex
    // to 1 — otherwise slides[2] is gone and the designer would unmount.
    fireEvent.click(await screen.findByTestId('signage-design-2'));
    expect(await screen.findByTestId('signage-designer-host')).toBeTruthy();

    fireEvent.click(screen.getByTestId('signage-delete-0'));
    await waitFor(() => {
      expect(screen.getByTestId('signage-slide-0').textContent).toMatch(/Menu/);
    });
    expect(screen.getByTestId('signage-designer-host')).toBeTruthy();
    expect(screen.getByTestId('signage-slide-1').textContent).toMatch(/Promo/);
    expect(screen.queryByTestId('signage-slide-2')).toBeNull();
  });

  it('shows empty state after deleting the only slide', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openPlaylistsTab();
    expect(await screen.findByTestId('signage-slide-0')).toBeTruthy();

    fireEvent.click(screen.getByTestId('signage-delete-0'));
    await waitFor(() => {
      expect(screen.queryByTestId('signage-slide-0')).toBeNull();
    });
    expect(screen.getByText(/No slides yet/i)).toBeTruthy();
    expect(toastSuccess).toHaveBeenCalledWith('Slide removed — save playlist to publish.');
  });
});
