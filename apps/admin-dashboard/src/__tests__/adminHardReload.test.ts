import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { purgeAdminCachesAndReload } from '../adminHardReload';

/**
 * Owner, 2026-10-17: Update now stayed on the old admin. A reload inside
 * /admin/ is answered by the service worker that is already in charge.
 */

describe('purgeAdminCachesAndReload', () => {
  const originalLocation = window.location;

  function stubLocation() {
    const loc = {
      origin: 'https://bakeandgrill.mv',
      href: 'https://bakeandgrill.mv/admin/',
      replace: vi.fn(),
    };
    Object.defineProperty(window, 'location', { configurable: true, value: loc });
    return loc;
  }

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('tells a waiting worker to take over and reloads /admin/', async () => {
    const loc = stubLocation();
    const listeners: Record<string, Array<() => void>> = {};
    const waiting = {
      state: 'installed',
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    const reg = {
      waiting,
      installing: null as ServiceWorker | null,
      update: vi.fn(),
      unregister: vi.fn(),
    };
    waiting.postMessage.mockImplementation(() => {
      listeners.controllerchange?.forEach((fn) => fn());
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(reg),
        getRegistrations: vi.fn().mockResolvedValue([reg]),
        addEventListener: (type: string, fn: () => void) => {
          (listeners[type] ??= []).push(fn);
        },
      },
    });

    await purgeAdminCachesAndReload();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reg.unregister).not.toHaveBeenCalled();
    expect(loc.replace).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/bakeandgrill\.mv\/admin\/\?_u=/));
  });

  it('reloads /admin/ when this browser has no service worker', async () => {
    const loc = stubLocation();
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(undefined),
        getRegistrations: vi.fn().mockResolvedValue([]),
        addEventListener: vi.fn(),
      },
    });

    await purgeAdminCachesAndReload();

    expect(loc.replace).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/bakeandgrill\.mv\/admin\/\?_u=/));
  });

  it('steps outside /admin/ when a worker is installed but nothing newer is waiting', async () => {
    const loc = stubLocation();
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(undefined),
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
        addEventListener: vi.fn(),
      },
    });

    await purgeAdminCachesAndReload();

    expect(unregister).toHaveBeenCalled();
    expect(loc.replace).toHaveBeenCalledWith('https://bakeandgrill.mv/admin-reload');
  });
});
