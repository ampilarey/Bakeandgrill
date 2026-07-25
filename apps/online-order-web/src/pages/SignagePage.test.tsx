import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignagePage } from './SignagePage';

const config = {
  screen: { id: 1, name: 'Main', slug: 'default', group_id: 1 },
  playlist_id: 1,
  playlist_version: 'abc',
  source: 'playlist',
  mode: 'normal',
  orientation: 'landscape',
  resolution: '1920x1080',
  refresh_seconds: 120,
  theme: { primary: '#D4813A', background: '#1C1408', text: '#fff' },
  slides: [
    {
      id: 's1',
      name: 'Hero',
      seconds: 1,
      weight: 1,
      transition: 'fade',
      transition_ms: 200,
      elements: [
        { id: 't1', type: 'text', x: 10, y: 40, w: 80, h: 20, text: 'Hello {{branch_name}}', style: {}, animation: { entrance: 'fade' }, binding: {} },
        { id: 'v1', type: 'video', x: 0, y: 0, w: 10, h: 10, binding: { url: 'https://example.com/v.mp4' }, style: {}, animation: {} },
      ],
    },
    {
      id: 's2',
      name: 'Missing asset',
      seconds: 1,
      weight: 1,
      transition: 'slide',
      elements: [
        { id: 'img1', type: 'image', x: 0, y: 0, w: 100, h: 100, binding: { url: '' }, style: {}, animation: {} },
      ],
    },
  ],
  rotation: ['s1', 's2'],
  variables: { branch_name: 'Bake & Grill', current_time: '1:00 PM', today: 'Today', next_prayer: '', wifi_name: '', wifi_password: '', promotion_name: '' },
  bestsellers: [],
  menu_new_days: 30,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/signage/heartbeat')) {
      return {
        ok: true,
        json: async () => ({
          device: { approved: true, pairing_code: null, screen_slug: 'default' },
          command: null,
        }),
      };
    }
    return {
      ok: true,
      json: async () => config,
    };
  }));
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    API_ORIGIN: 'http://localhost',
    fetchItems: vi.fn().mockResolvedValue({ data: [], channelUsed: 'online_pickup', deliveryFallback: false }),
    fetchOffers: vi.fn().mockResolvedValue({ offers: [] }),
    fetchCategories: vi.fn().mockResolvedValue({ data: [] }),
  };
});

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    settings: { site_name: 'Bake & Grill', logo: '/logo.png' },
    text: (_k: string, d: string) => d,
  }),
}));

describe('SignagePage', () => {
  it('renders element-tree slides with transition classes and no interactive chrome', async () => {
    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
          <Route path="/tv/:screen" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-page')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('signage-slide-canvas')).toBeTruthy();
    });
    expect(screen.getByText(/Hello Bake & Grill/)).toBeTruthy();
    expect(document.querySelector('.signage-tx-fade')).toBeTruthy();
    expect(document.querySelector('video')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/Add to cart/i)).toBeNull();
  });

  it('applies transition class and handles empty image binding without crashing', async () => {
    render(
      <MemoryRouter initialEntries={['/tv/default']}>
        <Routes>
          <Route path="/tv/:screen" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('signage-slide-canvas')).toBeTruthy());
    expect(document.querySelector('.signage-tx-fade, .signage-tx-slide')).toBeTruthy();
    expect(screen.getByTestId('signage-page')).toBeTruthy();
  });

  it('uses offline cache when fetch fails', async () => {
    localStorage.setItem('bg_signage_cache_v1:default', JSON.stringify({
      config,
      items: [],
      savedAt: Date.now(),
    }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-offline')).toBeTruthy();
    expect(screen.getByText(/Hello Bake & Grill/)).toBeTruthy();
  });

  it('shows pairing code until device is approved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/signage/heartbeat')) {
        return {
          ok: true,
          json: async () => ({
            device: { approved: false, pairing_code: 'AB12CD', screen_slug: null },
            command: null,
          }),
        };
      }
      return { ok: true, json: async () => config };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-pairing-code')).toHaveTextContent('AB12CD');
  });

  it('dispatches remote commands received from heartbeat', async () => {
    let heartbeats = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/signage/heartbeat')) {
        heartbeats += 1;
        return {
          ok: true,
          json: async () => ({
            device: { approved: true, pairing_code: null, screen_slug: 'default' },
            command: heartbeats === 1 ? { type: 'pause' } : null,
          }),
        };
      }
      return { ok: true, json: async () => config };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('signage-page').getAttribute('data-command')).toBe('pause');
    });
  });
});
