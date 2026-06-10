import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("pingAuth network resilience", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.setItem("pos_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("does not dispatch auth_expired when fetch fails with a network error", async () => {
    const expired = vi.fn();
    window.addEventListener("auth_expired", expired);

    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const { pingAuth } = await import("./auth");
    await expect(pingAuth()).rejects.toThrow();
    expect(expired).not.toHaveBeenCalled();

    expect(localStorage.getItem("pos_token")).toBe("test-token");
  });
});
