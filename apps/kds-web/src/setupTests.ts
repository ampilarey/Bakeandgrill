import "@testing-library/jest-dom";

if (!globalThis.crypto?.randomUUID) {
  (globalThis as any).crypto = {
    randomUUID: () => "test-uuid",
  };
}
