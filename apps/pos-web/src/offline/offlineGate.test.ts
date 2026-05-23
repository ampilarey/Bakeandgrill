import { describe, expect, it, vi, beforeEach } from "vitest";
import { evaluateOfflineGate } from "./offlineGate";

vi.mock("./db", () => ({
  ensureCachedStaffSession: vi.fn(),
  loadCachedShift: vi.fn(),
  loadCachedMenu: vi.fn(),
}));

import { ensureCachedStaffSession, loadCachedMenu, loadCachedShift } from "./db";

describe("offlineGate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(ensureCachedStaffSession).mockReset();
    vi.mocked(loadCachedShift).mockReset();
    vi.mocked(loadCachedMenu).mockReset();
  });

  it("blocks when no cached shift", async () => {
    localStorage.setItem("pos_token", "token");
    vi.mocked(ensureCachedStaffSession).mockResolvedValue({
      id: "current",
      staff_user_id: 1,
      name: "Staff",
      permissions: [],
      cached_at: new Date().toISOString(),
    });
    vi.mocked(loadCachedShift).mockResolvedValue(null);
    vi.mocked(loadCachedMenu).mockResolvedValue({
      id: "channel:takeaway",
      channel: "takeaway",
      categories: [],
      items: [{ id: 1 }],
      cached_at: new Date().toISOString(),
    });

    const result = await evaluateOfflineGate();
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/shift/i);
  });
});
