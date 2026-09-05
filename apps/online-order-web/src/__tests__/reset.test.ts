import { beforeEach, describe, expect, it, vi } from 'vitest';
import resetSource from '../../public/reset.js?raw';

/**
 * /order/reset — the escape hatch.
 *
 * Owner, 2026-09-05, after three rounds of the same missing item: the API had
 * it, the deployed bundle had it, and a clean browser showed it, but that one
 * device kept showing a menu without it. Nobody could clear that device's copy
 * or even say which build it was running.
 *
 * Two things matter here and are easy to get wrong. It must do nothing at all
 * on ordinary pages — an escape hatch that fires on the menu would wipe the
 * app out from under every customer — and it must always finish, because a
 * browser that refuses to unregister a worker or open a cache must still leave
 * somebody with a way forward rather than a spinner.
 */

type Ctx = {
  waitForOverlay: () => Promise<string>;
  unregister: ReturnType<typeof vi.fn>;
  cacheDelete: ReturnType<typeof vi.fn>;
};

function run(opts: {
  pathname: string;
  search?: string;
  registrations?: () => Promise<unknown>;
  cacheKeys?: () => Promise<string[]>;
}): Ctx {
  document.body.innerHTML = '<div id="root">the app</div>';

  const unregister = vi.fn().mockResolvedValue(true);
  const cacheDelete = vi.fn().mockResolvedValue(true);

  const win = { location: { pathname: opts.pathname, search: opts.search ?? '' } };
  const navigatorStub = {
    serviceWorker: {
      getRegistrations: opts.registrations ?? (() => Promise.resolve([{ unregister }])),
    },
  };
  const cachesStub = {
    keys: opts.cacheKeys ?? (() => Promise.resolve(['bg-pwa-old-static'])),
    delete: cacheDelete,
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('window', 'document', 'navigator', 'caches', resetSource)(
    win, document, navigatorStub, cachesStub,
  );

  const waitForOverlay = async () => {
    for (let i = 0; i < 50; i += 1) {
      const overlay = document.body.lastElementChild;
      if (overlay?.id !== 'root' && (overlay?.textContent ?? '').includes('Cleared')) {
        return overlay!.textContent ?? '';
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    return document.body.lastElementChild?.textContent ?? '';
  };

  return { waitForOverlay, unregister, cacheDelete };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('on an ordinary page', () => {
  it('does nothing at all', async () => {
    const { unregister, cacheDelete } = run({ pathname: '/order/menu' });

    await new Promise((r) => setTimeout(r, 20));

    expect(unregister).not.toHaveBeenCalled();
    expect(cacheDelete).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe('<div id="root">the app</div>');
  });

  it('is not fooled by a query that merely contains the word', async () => {
    const { unregister } = run({ pathname: '/order/menu', search: '?q=fresh=12' });

    await new Promise((r) => setTimeout(r, 20));

    expect(unregister).not.toHaveBeenCalled();
  });
});

describe('on /order/reset', () => {
  it('unregisters the workers and deletes the caches', async () => {
    const ctx = run({ pathname: '/order/reset' });

    await ctx.waitForOverlay();

    expect(ctx.unregister).toHaveBeenCalledTimes(1);
    expect(ctx.cacheDelete).toHaveBeenCalledWith('bg-pwa-old-static');
  });

  it('leaves the app in the page rather than tearing it out', async () => {
    // Replacing <body> takes #root with it and the app throws on mount, which
    // is a worse first impression than the problem being fixed.
    const ctx = run({ pathname: '/order/reset' });

    await ctx.waitForOverlay();

    expect(document.getElementById('root')).not.toBeNull();
  });

  it('reports the build so a device that is still wrong can be named', async () => {
    const ctx = run({ pathname: '/order/reset' });

    expect(await ctx.waitForOverlay()).toMatch(/Build/);
  });

  it('works from ?fresh=1 on any order-app URL', async () => {
    const ctx = run({ pathname: '/order/menu', search: '?fresh=1' });

    await ctx.waitForOverlay();

    expect(ctx.unregister).toHaveBeenCalled();
  });
});

describe('when the browser refuses', () => {
  it('still finishes when service workers cannot be listed', async () => {
    const ctx = run({
      pathname: '/order/reset',
      registrations: () => Promise.reject(new Error('denied')),
    });

    expect(await ctx.waitForOverlay()).toMatch(/Cleared/);
  });

  it('still finishes when the cache store is unavailable', async () => {
    // Private browsing denies storage; landing on a spinner forever would be
    // the worst outcome of asking someone to try this.
    const ctx = run({
      pathname: '/order/reset',
      cacheKeys: () => Promise.reject(new Error('denied')),
    });

    expect(await ctx.waitForOverlay()).toMatch(/Cleared/);
  });
});
