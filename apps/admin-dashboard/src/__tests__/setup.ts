import '@testing-library/jest-dom';

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
