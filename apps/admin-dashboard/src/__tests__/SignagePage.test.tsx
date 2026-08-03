import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { boardPixelSize, SignagePage } from '../pages/SignagePage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';
import { injectSignageMobileCss, setViewportWidth } from './viewport';

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
  emergency: { manual: 'none', entries: [] },
  prayer: { enabled: true, prayers: ['fajr', 'dhuhr'], break_minutes: 15, island_id: 102 },
  prayer_islands: [
    { id: 102, label: 'Kaafu · Malé', atoll: 'Kaafu' },
    { id: 201, label: 'Addu · Hithadhoo', atoll: 'Addu' },
  ],
  templates: [{ key: 'hero', label: 'Hero' }],
  custom_templates: [],
  wifi: { name: '', password: '' },
  banner: {
    enabled: true,
    banners: [{
      id: 'main',
      label: 'Prayer',
      enabled: true,
      position: 'bottom',
      fields: ['date', 'time', 'next_prayer', 'countdown'],
      custom_text: '',
      speed_seconds: 40,
      duration_seconds: 30,
      font_scale: 1.15,
      height_scale: 1,
      text_color: '#fff8f0',
      background_color: 'rgba(12, 8, 4, 0.78)',
      align: 'left',
      scroll_mode: 'seamless',
      direction: 'ltr',
      repeat_count: 1,
      date_format: 'full',
      inset_percent: 0,
    }],
  },
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

  it('pending pairing row and tab strip do not overflow at 390px', async () => {
    setViewportWidth(390);
    const style = injectSignageMobileCss();
    renderWithRouter(<SignagePage />);

    const tabRow = await screen.findByTestId('signage-tab-row');
    expect(getComputedStyle(tabRow).flexWrap).toBe('nowrap');
    expect(getComputedStyle(tabRow).overflowX).toBe('auto');

    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    const pending = await screen.findByTestId('signage-pending-1');
    expect(pending.className).toMatch(/\bform-grid-3\b/);
    expect(pending.style.gridTemplateColumns).toMatch(/auto-fit/);
    pending.style.width = '390px';
    expect(getComputedStyle(pending).gridTemplateColumns.replace(/\s+/g, ' ').trim()).toBe('1fr');
    expect(pending.scrollWidth).toBeLessThanOrEqual(pending.clientWidth + 1);

    style.remove();
    setViewportWidth(1024);
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

  it('exposes prayer island selector from overview', async () => {
    renderWithRouter(<SignagePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Prayer' }));
    const select = await screen.findByTestId('signage-prayer-island');
    expect(select).toBeTruthy();
    expect(select.querySelectorAll('option').length).toBeGreaterThanOrEqual(2);
    expect((select as HTMLSelectElement).value).toBe('102');
  });

  it('Banner tab shows prayer island summary without a second editable dropdown', async () => {
    renderWithRouter(<SignagePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Banner' }));
    const summary = await screen.findByTestId('signage-banner-prayer-island-summary');
    expect(summary.textContent).toMatch(/Prayer times:/);
    expect(summary.textContent).toMatch(/Kaafu · Malé/);
    expect(summary.textContent).toMatch(/change in the Prayer tab/);
    expect(screen.queryByTestId('signage-prayer-island')).toBeNull();
    expect(screen.getByTestId('signage-banner-panel').querySelectorAll('select[data-testid="signage-prayer-island"]').length).toBe(0);

    fireEvent.click(screen.getByTestId('signage-banner-goto-prayer'));
    expect(await screen.findByTestId('signage-prayer-island')).toBeTruthy();
  });

  it('Banner appearance UX: swatches, sizes, align visibility, edge checkbox, live preview', async () => {
    const saveSpy = vi.spyOn(api, 'setSignageBanner').mockResolvedValue({
      banner: mockOverview.banner!,
    });

    renderWithRouter(<SignagePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Banner' }));

    expect(await screen.findByTestId('signage-banner-preview')).toBeTruthy();
    expect(screen.getByTestId('signage-banner')).toBeTruthy();

    const appearance = await screen.findByTestId('signage-banner-appearance-main');
    fireEvent.click(appearance.querySelector('summary')!);

    // Off-preset 1.15 shows nearest Medium without rewriting until change.
    const fontSelect = screen.getByTestId('signage-banner-font-scale-main') as HTMLSelectElement;
    expect(fontSelect.value).toBe('1');

    // Align hidden unless motion is static.
    const advanced = screen.getByTestId('signage-banner-advanced-main');
    fireEvent.click(advanced.querySelector('summary')!);
    expect(screen.queryByTestId('signage-banner-align-main')).toBeNull();

    fireEvent.change(screen.getByTestId('signage-banner-scroll-mode-main'), {
      target: { value: 'static' },
    });
    expect(await screen.findByTestId('signage-banner-align-main')).toBeTruthy();

    // Edge checkbox stores 3 when checked.
    fireEvent.click(screen.getByTestId('signage-banner-inset-main'));

    // Swatch sets text colour; preview updates without save.
    fireEvent.click(screen.getByTestId('signage-banner-text-swatch-main-white'));
    await waitFor(() => {
      const bannerEl = screen.getByTestId('signage-banner');
      expect(bannerEl.style.getPropertyValue('--signage-banner-color').toLowerCase()).toBe('#ffffff');
    });
    expect(saveSpy).not.toHaveBeenCalled();

    // Native picker can set an arbitrary colour.
    fireEvent.change(screen.getByTestId('signage-banner-text-color-main-picker'), {
      target: { value: '#112233' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('signage-banner').style.getPropertyValue('--signage-banner-color').toLowerCase()).toBe('#112233');
    });

    // Transparency slider composes rgba on background.
    fireEvent.change(screen.getByTestId('signage-banner-bg-color-main-transparency'), {
      target: { value: '0' },
    });
    await waitFor(() => {
      const bg = screen.getByTestId('signage-banner').style.getPropertyValue('--signage-banner-bg').toLowerCase();
      expect(bg === '#0c0804' || bg === 'rgba(12, 8, 4, 1)').toBe(true);
    });

    // Preview reflects motion mode.
    expect(screen.getByTestId('signage-banner').getAttribute('data-scroll-mode')).toBe('static');

    // Repeat slider hidden with one enabled banner.
    expect(screen.queryByTestId('signage-banner-repeat-main')).toBeNull();

    // Choosing a named font size stores the multiplier; saving keeps off-preset until edited.
    fireEvent.change(fontSelect, { target: { value: '1.3' } });
    fireEvent.click(screen.getByTestId('signage-banner-save'));
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    const payload = saveSpy.mock.calls[0][0];
    expect(payload.banners?.[0]?.font_scale).toBe(1.3);
    expect(payload.banners?.[0]?.inset_percent).toBe(3);
    expect(payload.banners?.[0]?.scroll_mode).toBe('static');
  });

  it('Banner timing: speed slider stores presets; repeat_count shown with two enabled banners', async () => {
    const saveSpy = vi.spyOn(api, 'setSignageBanner').mockResolvedValue({
      banner: mockOverview.banner!,
    });

    renderWithRouter(<SignagePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Banner' }));
    await screen.findByTestId('signage-banner-item-main');

    const speedSlider = screen.getByTestId('signage-banner-speed-slider-main') as HTMLInputElement;
    expect(speedSlider.value).toBe('1');
    expect(screen.queryByTestId('signage-banner-repeat-main')).toBeNull();

    fireEvent.click(screen.getByTestId('signage-banner-add'));
    await waitFor(() => {
      expect(screen.getByTestId('signage-banner-repeat-main')).toBeTruthy();
    });

    fireEvent.change(speedSlider, { target: { value: '2' } }); // Fast = 20
    fireEvent.change(screen.getByTestId('signage-banner-repeat-slider-main'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByTestId('signage-banner-save'));
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    const payload = saveSpy.mock.calls[0][0];
    expect(payload.banners?.[0]?.speed_seconds).toBe(20);
    expect(payload.banners?.[0]?.repeat_count).toBe(4);
    expect(payload.banners?.[1]?.scroll_mode).toBe('ticker');
  });

  it('Banner direction and show_logo_between are included in save payload', async () => {
    const saveSpy = vi.spyOn(api, 'setSignageBanner').mockResolvedValue({
      banner: mockOverview.banner!,
    });

    renderWithRouter(<SignagePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Banner' }));
    await screen.findByTestId('signage-banner-item-main');

    fireEvent.click(screen.getByTestId('signage-banner-add'));
    await waitFor(() => expect(screen.getByTestId('signage-banner-show-logo-between')).toBeTruthy());

    fireEvent.change(screen.getByTestId('signage-banner-direction-main'), {
      target: { value: 'rtl' },
    });
    fireEvent.click(screen.getByTestId('signage-banner-show-logo-between'));
    fireEvent.click(screen.getByTestId('signage-banner-save'));
    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    const payload = saveSpy.mock.calls[0][0];
    expect(payload.banners?.[0]?.direction).toBe('rtl');
    expect(payload.show_logo_between).toBe(true);
  });
});

describe('SignagePage mobile footer clearance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewportWidth(390);
    injectSignageMobileCss();
    vi.spyOn(api, 'getSignageOverview').mockResolvedValue(mockOverview);
    vi.spyOn(api, 'fetchSignageDevices').mockResolvedValue({ data: [] });
  });

  it('renders group Save controls inside the shell main on mobile', async () => {
    // Clearance itself is covered by the CSS source + MobileTabBar height tests;
    // here we only guard that the clipped control still mounts on the screens tab.
    const main = document.createElement('main');
    main.className = 'admin-shell-main admin-shell-main--mobile';
    document.body.appendChild(main);
    const { container } = renderWithRouter(<SignagePage />);
    main.appendChild(container);
    expect(await screen.findByTestId('signage-group-save-10')).toBeTruthy();
    expect(main.contains(screen.getByTestId('signage-group-save-10'))).toBe(true);
  });
});
