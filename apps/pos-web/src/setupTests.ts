import "@testing-library/jest-dom";

if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = {
    randomUUID: () => "test-uuid",
  } as Crypto;
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
