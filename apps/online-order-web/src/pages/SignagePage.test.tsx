import { act, render, screen, waitFor } from '@testing-library/react';
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
    settings: {
      site_name: 'Bake & Grill',
      logo: '/logo-light.png',
      logo_dark: '/logo-dark.png',
      business_phone: '+960 912 0011',
      business_website: 'https://bakeandgrill.mv',
    },
    text: (_k: string, d: string) => d,
  }),
}));

describe('SignagePage', () => {
  it('adds signage-embed class when ?embed=1 is present', async () => {
    render(
      <MemoryRouter initialEntries={['/tv?embed=1']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const root = await screen.findByTestId('signage-page');
    expect(root.className).toMatch(/\bsignage-embed\b/);
    expect(root.getAttribute('data-embed')).toBe('1');
    expect(screen.queryByTestId('signage-fullscreen-btn')).toBeNull();
  });

  it('does not add signage-embed when top-level without embed query', async () => {
    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const root = await screen.findByTestId('signage-page');
    expect(root.className).not.toMatch(/\bsignage-embed\b/);
    expect(root.getAttribute('data-embed')).toBe('0');
    expect(await screen.findByTestId('signage-fullscreen-btn')).toBeTruthy();
  });

  it('skips heartbeat when embedded', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/signage/heartbeat')) {
        return {
          ok: true,
          json: async () => ({
            device: { approved: false, pairing_code: 'ZZZZZZ', screen_slug: null },
            command: null,
          }),
        };
      }
      return { ok: true, json: async () => config };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/tv?embed=1']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('signage-page');
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/signage'))).toBe(true);
    });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/signage/heartbeat'))).toBe(false);
    expect(screen.queryByTestId('signage-pairing-code')).toBeNull();
  });

  it('merges mode/banner on same-version refresh without waiting for slide boundary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const bannerCfg = {
      enabled: true,
      banners: [{
        id: 'info',
        label: 'Info',
        enabled: true,
        position: 'bottom' as const,
        fields: ['time'],
        speed_seconds: 40,
        duration_seconds: 30,
      }],
    };
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
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          json: async () => ({
            ...config,
            refresh_seconds: 30,
            mode: 'normal',
            banner: bannerCfg,
            prayer_schedule: [],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          ...config,
          playlist_version: 'abc',
          refresh_seconds: 30,
          // Same version but mode flips — banner must hide immediately (live merge).
          mode: 'prayer_break',
          banner: bannerCfg,
          prayer_schedule: [],
        }),
      };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-banner')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(2);
      expect(screen.queryByTestId('signage-banner')).toBeNull();
    });
  });

  it('applies data-paused and pauses banner class when pause command fires', async () => {
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
      return {
        ok: true,
        json: async () => ({
          ...config,
          banner: {
            enabled: true,
            banners: [{
              id: 'info',
              label: 'Info',
              enabled: true,
              position: 'bottom',
              fields: ['time'],
              speed_seconds: 40,
              duration_seconds: 30,
            }],
          },
        }),
      };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const root = screen.getByTestId('signage-page');
      expect(root.getAttribute('data-paused')).toBe('1');
      expect(root.className).toMatch(/\bsignage-paused\b/);
    });
  });

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
    expect(screen.queryByTestId('signage-boot-error')).toBeNull();
    expect(screen.queryByTestId('signage-loading')).toBeNull();
  });

  it('shows a boot error (not a spinner) when fetch fails with empty cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-boot-error')).toBeTruthy();
    expect(screen.getByTestId('signage-boot-error-note')).toHaveTextContent(/Cannot reach the server — retrying/);
    expect(screen.queryByTestId('signage-loading')).toBeNull();
    expect(screen.queryByTestId('signage-offline')).toBeNull();
  });

  it('recovers to a normal board after a failed first load when refresh succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let configAttempts = 0;
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
      configAttempts += 1;
      if (configAttempts === 1) {
        throw new Error('network');
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

    expect(await screen.findByTestId('signage-boot-error')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('signage-boot-error')).toBeNull();
      expect(screen.getByTestId('signage-slide-canvas')).toBeTruthy();
    });
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

  it('shows a quiet loading state before config arrives', async () => {
    let resolveConfig: ((v: typeof config) => void) | undefined;
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
        json: () => new Promise((resolve) => { resolveConfig = resolve; }),
      };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-loading')).toBeTruthy();
    expect(screen.queryByTestId('signage-idle-brand')).toBeNull();
    resolveConfig?.(config);
    expect(await screen.findByTestId('signage-slide-canvas')).toBeTruthy();
  });

  it('renders brand_card idle slide when playlist has no slides', async () => {
    const empty = {
      ...config,
      slides: [],
      rotation: [],
      variables: {
        ...config.variables,
        business_phone: '+960 912 0011',
        business_website: 'https://bakeandgrill.mv',
      },
    };
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
      return { ok: true, json: async () => empty };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-idle-brand')).toBeTruthy();
    expect(screen.queryByTestId('signage-loading')).toBeNull();
    expect(screen.getByText('Bake & Grill')).toBeTruthy();
    expect(screen.getByText('+960 912 0011')).toBeTruthy();
    expect(screen.getByText('https://bakeandgrill.mv')).toBeTruthy();
    const logos = document.querySelectorAll('img');
    const srcs = Array.from(logos).map((img) => img.getAttribute('src') || '');
    expect(srcs.some((s) => s.includes('logo-dark'))).toBe(true);
  });

  it('shows info banner under normal mode when enabled', async () => {
    const withBanner = {
      ...config,
      mode: 'normal',
      banner: {
        enabled: true,
        banners: [{
          id: 'info',
          label: 'Info',
          enabled: true,
          position: 'bottom',
          fields: ['date', 'time', 'next_prayer', 'countdown'],
          speed_seconds: 40,
          duration_seconds: 30,
        }],
      },
      prayer_schedule: [
        { name: 'Dhuhr', at: new Date(Date.now() + 90 * 60_000).toISOString() },
      ],
    };
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
      return { ok: true, json: async () => withBanner };
    }));

    render(
      <MemoryRouter initialEntries={['/tv']}>
        <Routes>
          <Route path="/tv" element={<SignagePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('signage-banner')).toBeTruthy();
  });

  it('hides info banner under emergency and prayer_break modes', async () => {
    for (const mode of ['emergency:closed', 'prayer_break'] as const) {
      const withBanner = {
        ...config,
        mode,
        banner: {
          enabled: true,
          banners: [{
            id: 'info',
            label: 'Info',
            enabled: true,
            position: 'bottom',
            fields: ['date', 'time'],
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        },
        prayer_schedule: [],
      };
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
        return { ok: true, json: async () => withBanner };
      }));

      const { unmount } = render(
        <MemoryRouter initialEntries={['/tv']}>
          <Routes>
            <Route path="/tv" element={<SignagePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => expect(screen.getByTestId('signage-page')).toBeTruthy());
      expect(screen.queryByTestId('signage-banner')).toBeNull();
      unmount();
    }
  });
});
