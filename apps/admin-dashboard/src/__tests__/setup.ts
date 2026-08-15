import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// The Content Hub page mounts a lot at once (layout editor, hero carousel,
// rich-text editors). Under a full-suite run one findBy per file can brush the
// 1s default and fail on timing alone — the interactions themselves measure in
// single-digit milliseconds. Give the whole suite headroom.
configure({ asyncUtilTimeout: 5000 });

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
