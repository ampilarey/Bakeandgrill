import "@testing-library/jest-dom";
import "fake-indexeddb/auto";

// The test DOM ships without matchMedia, and components that ask the
// viewport a question — the customer picker, which becomes a sheet on a
// phone — call it while rendering. Nothing matches: tests get the wide
// layout unless they stub it themselves.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!globalThis.crypto?.randomUUID) {
  (globalThis as any).crypto = {
    randomUUID: () => "test-uuid",
  };
}

if (!globalThis.localStorage || typeof localStorage.getItem !== "function") {
  let store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}
