import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { purgePosCachesAndReload } from "./posHardReload";

describe("purgePosCachesAndReload", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue(["workbox-precache-v2"]),
      delete: vi.fn().mockResolvedValue(true),
    });
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: vi.fn().mockResolvedValue(true) }]),
      },
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, origin: "https://test.bakeandgrill.mv", href: "" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.unstubAllGlobals();
  });

  it("clears caches, unregisters SW, and navigates to /pos/", async () => {
    await purgePosCachesAndReload();
    expect(caches.delete).toHaveBeenCalledWith("workbox-precache-v2");
    expect(window.location.href).toMatch(/^https:\/\/test\.bakeandgrill\.mv\/pos\/\?_u=/);
  });
});
