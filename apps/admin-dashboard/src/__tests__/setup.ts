import '@testing-library/jest-dom';
import { configure, getConfig } from '@testing-library/react';

// The Content Hub page mounts a lot at once (layout editor, hero carousel,
// rich-text editors). Under a full-suite run one findBy per file can brush the
// 1s default and fail on timing alone — the interactions themselves measure in
// single-digit milliseconds. Give the whole suite headroom. 10 s since
// 2026-10-17: on CI runners under a full run, Telegram's shop-group test (5.3 s)
// and the recipe editor's save brushed the old 5 s and failed on timing alone.
//
// A findBy or waitFor resolves on the DOM change it looks for, while React's
// next piece of work (the render from a resolved request, the effects after
// it) is queued on its scheduler for a later macrotask. The library's own
// drain after that is a setTimeout(0), which on a slow runner fires before
// the queued work, so a test looking straight away for what the next render
// shows found the loading state instead (CI, 2026-10-21: four tests in five
// runs). After the library's drain, wait out a few scheduler hops so what is
// already queued has landed. The real setImmediate, since a test may fake
// timers; out of the act environment while waiting, as the library does.
type Hop = (fn: () => void) => void;
const nodeSetImmediate = (globalThis as { setImmediate?: Hop }).setImmediate;
const hop: Hop = typeof nodeSetImmediate === 'function' ? nodeSetImmediate : (fn) => { setTimeout(fn, 0); };
const { asyncWrapper: libraryAsyncWrapper } = getConfig();
configure({
    asyncUtilTimeout: 10000,
    asyncWrapper: async (cb) => {
        const result = await libraryAsyncWrapper(cb);
        const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
        const wasActEnvironment = g.IS_REACT_ACT_ENVIRONMENT;
        g.IS_REACT_ACT_ENVIRONMENT = false;
        try {
            for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => hop(resolve));
        } finally {
            g.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
        }
        return result;
    },
});

// vitest 4 + jsdom 28 doesn't always expose a working Storage API on
// the global `localStorage`. Tests that called `localStorage.setItem`
// blew up with "localStorage.setItem is not a function". Install a
// minimal in-memory polyfill before every test if the global is
// missing or broken.
if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
    const store = new Map<string, string>();
    const polyfill: Storage = {
        get length() { return store.size; },
        clear() { store.clear(); },
        getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
        key(i: number) { return Array.from(store.keys())[i] ?? null; },
        removeItem(key: string) { store.delete(key); },
        setItem(key: string, value: string) { store.set(key, String(value)); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: polyfill, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: polyfill, configurable: true });
}

// jsdom has no matchMedia. Resolve max/min-width against window.innerWidth so
// useIsMobile (AppShell's `(max-width: 767px)` band) and layout tests agree.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList => {
        const width = window.innerWidth;
        const max = /max-width:\s*(\d+)px/.exec(query);
        const min = /min-width:\s*(\d+)px/.exec(query);
        let matches = false;
        if (max && min) matches = width <= Number(max[1]) && width >= Number(min[1]);
        else if (max) matches = width <= Number(max[1]);
        else if (min) matches = width >= Number(min[1]);
        return {
            matches,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        } as MediaQueryList;
    };
}
