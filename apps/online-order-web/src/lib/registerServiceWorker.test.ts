import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

/*
 * Audit, 2026-09-17: the registration was an inline script that the page's
 * own CSP refused, so no customer ever got the worker. It registers from the
 * bundle now, and this holds the three things the inline version promised.
 */
describe('registerServiceWorker', () => {
  function fakeContainer(over: Partial<{ waiting: unknown; controller: unknown }> = {}) {
    const listeners: Record<string, Array<() => void>> = {};
    const installing = {
      state: 'installed',
      postMessage: vi.fn(),
      addEventListener: vi.fn((name: string, cb: () => void) => { (listeners[`sw:${name}`] ??= []).push(cb); }),
    };
    const reg = {
      waiting: over.waiting ?? null,
      installing,
      addEventListener: vi.fn((name: string, cb: () => void) => { (listeners[`reg:${name}`] ??= []).push(cb); }),
    };
    const container = {
      controller: over.controller ?? null,
      register: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn((name: string, cb: () => void) => { (listeners[`c:${name}`] ??= []).push(cb); }),
    };
    const fire = (key: string) => (listeners[key] ?? []).forEach((cb) => cb());
    return { container, reg, installing, fire };
  }

  it('registers the worker under /order/ once the page has loaded', async () => {
    const { container } = fakeContainer();
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

    registerServiceWorker(container as unknown as ServiceWorkerContainer);
    await Promise.resolve();

    expect(container.register).toHaveBeenCalledWith('/order/sw.js', { scope: '/order/' });
  });

  it('tells a waiting worker to take over, and a freshly installed one too', async () => {
    const waiting = { postMessage: vi.fn() };
    const { container, installing, fire } = fakeContainer({ waiting, controller: {} });
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

    registerServiceWorker(container as unknown as ServiceWorkerContainer);
    await Promise.resolve();
    await Promise.resolve();

    expect(waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
    fire('reg:updatefound');
    fire('sw:statechange');
    expect(installing.postMessage).toHaveBeenCalledWith('SKIP_WAITING');
  });

  it('reloads once when a new worker replaces an older one', async () => {
    const { container, fire } = fakeContainer({ controller: {} });
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    registerServiceWorker(container as unknown as ServiceWorkerContainer);
    await Promise.resolve();
    await Promise.resolve();
    fire('c:controllerchange');
    fire('c:controllerchange');

    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('does not reload on the first visit, when there is no older worker (UI audit, 2026-10-10)', async () => {
    const { container, fire } = fakeContainer({ controller: null });
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    registerServiceWorker(container as unknown as ServiceWorkerContainer);
    await Promise.resolve();
    await Promise.resolve();
    fire('c:controllerchange');

    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does nothing where there is no service worker support', () => {
    expect(() => registerServiceWorker(undefined)).not.toThrow();
  });
});
