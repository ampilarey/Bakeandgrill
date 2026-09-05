import { beforeEach, describe, expect, it, vi } from 'vitest';
import swSource from '../../public/sw.js?raw';

/**
 * The service worker's menu cache.
 *
 * Owner, 2026-09-05: an item added at 15:51 was still missing from the
 * installed app at 20:20, while the API had been serving it all afternoon and
 * the deployed bundle rendered it correctly when fed that payload.
 *
 * This is the code that can do that. `networkFirst` fell back to the cache on
 * *any* fetch failure, and on a phone that happens routinely — so a copy of the
 * menu made hours earlier was served back looking exactly like a working menu,
 * with nothing to indicate it was old. These tests pin the rule that replaced
 * it: fall back because the device is offline, never merely because a fetch
 * was unlucky.
 *
 * sw.js is plain script served from `public/`, so it is pulled in as text and
 * run here in a stub worker scope rather than imported.
 */

type SwScope = {
  menuNetworkFirst: (req: unknown, cache: string) => Promise<Response>;
  CACHED_AT_HEADER: string;
};

function loadServiceWorker(opts: {
  online: boolean;
  cached?: Response;
  fetchImpl: () => Promise<Response>;
}): { scope: SwScope; put: ReturnType<typeof vi.fn> } {
  const put = vi.fn();
  const cache = {
    match: vi.fn().mockResolvedValue(opts.cached),
    put,
    add: vi.fn(),
  };

  const listeners: Record<string, unknown> = {};
  const self = {
    addEventListener: (name: string, fn: unknown) => { listeners[name] = fn; },
    navigator: { onLine: opts.online },
    location: { origin: 'https://bakeandgrill.mv' },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn() },
    registration: { showNotification: vi.fn() },
  };

  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    match: vi.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const load = new Function(
    'self', 'caches', 'clients', 'fetch',
    `${swSource}\n;return { menuNetworkFirst, CACHED_AT_HEADER };`,
  ) as (...args: unknown[]) => SwScope;

  return { scope: load(self, caches, self.clients, opts.fetchImpl), put };
}

function stampedResponse(body: string, ageMs: number): Response {
  return new Response(body, {
    headers: { 'x-bg-cached-at': String(Date.now() - ageMs) },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('the menu cache serves the network first', () => {
  it('returns and stores the fresh response when the fetch succeeds', async () => {
    const { scope, put } = loadServiceWorker({
      online: true,
      fetchImpl: () => Promise.resolve(new Response('{"data":["fresh"]}')),
    });

    const res = await scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api');

    expect(await res.text()).toBe('{"data":["fresh"]}');
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('stamps what it stores so the copy has a knowable age', async () => {
    const { scope, put } = loadServiceWorker({
      online: true,
      fetchImpl: () => Promise.resolve(new Response('{"data":[]}')),
    });

    await scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api');

    const stored = put.mock.calls[0][1] as Response;
    expect(Number(stored.headers.get('x-bg-cached-at'))).toBeGreaterThan(0);
  });
});

describe('when the fetch fails', () => {
  const failing = () => Promise.reject(new Error('network'));

  it('serves the last menu it saw when the device is offline', async () => {
    // No network at all: something the customer saw before beats nothing.
    const { scope } = loadServiceWorker({
      online: false,
      cached: stampedResponse('{"data":["old"]}', 6 * 60 * 60 * 1000),
      fetchImpl: failing,
    });

    const res = await scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api');

    expect(await res.text()).toBe('{"data":["old"]}');
  });

  it('covers a momentary blip with a recent copy', async () => {
    const { scope } = loadServiceWorker({
      online: true,
      cached: stampedResponse('{"data":["recent"]}', 60 * 1000),
      fetchImpl: failing,
    });

    const res = await scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api');

    expect(await res.text()).toBe('{"data":["recent"]}');
  });

  it('refuses to pass off an hours-old menu as the menu', async () => {
    // The owner's case. Online, one failed request, and the old copy used to
    // come back looking exactly like a working menu.
    const { scope } = loadServiceWorker({
      online: true,
      cached: stampedResponse('{"data":["stale"]}', 4 * 60 * 60 * 1000),
      fetchImpl: failing,
    });

    await expect(
      scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api'),
    ).rejects.toThrow('network');
  });

  it('treats an unstamped entry from an older worker as ancient', async () => {
    // Entries cached before stamping existed have no age we can trust, and
    // assuming they are current is the bug all over again.
    const { scope } = loadServiceWorker({
      online: true,
      cached: new Response('{"data":["unstamped"]}'),
      fetchImpl: failing,
    });

    await expect(
      scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api'),
    ).rejects.toThrow('network');
  });

  it('reports the failure when there is nothing cached at all', async () => {
    const { scope } = loadServiceWorker({ online: true, fetchImpl: failing });

    await expect(
      scope.menuNetworkFirst(new Request('https://bakeandgrill.mv/api/items'), 'api'),
    ).rejects.toThrow('network');
  });
});

describe('the cache version tracks the build', () => {
  it('carries the placeholder the bundler replaces', () => {
    // A hand-edited constant means a byte-identical sw.js, which means the
    // browser never replaces the worker and its caches outlive every deploy.
    // The build plugin throws if this placeholder ever goes missing.
    expect(swSource).toContain('__SW_BUILD_ID__');
  });
});
