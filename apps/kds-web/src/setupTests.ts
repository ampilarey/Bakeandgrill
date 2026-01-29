import "@testing-library/jest-dom";

if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = {
    randomUUID: () => "test-uuid",
  } as Crypto;
}
