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

    const result = await evaluateOfflineGate({ requireShift: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/shift/i);
  });

  it("allows ops-only staff offline without cached shift", async () => {
    localStorage.setItem("pos_token", "token");
    vi.mocked(ensureCachedStaffSession).mockResolvedValue({
      id: "current",
      staff_user_id: 1,
      name: "Staff",
      permissions: ["inventory.manage"],
      cached_at: new Date().toISOString(),
    });
    vi.mocked(loadCachedShift).mockResolvedValue(null);
    vi.mocked(loadCachedMenu).mockResolvedValue(null);

    const result = await evaluateOfflineGate({ requireShift: false });
    expect(result.allowed).toBe(true);
  });

  it("blocks sales offline when cached shift belongs to another staff user", async () => {
    localStorage.setItem("pos_token", "token");
    vi.mocked(ensureCachedStaffSession).mockResolvedValue({
      id: "current",
      staff_user_id: 2,
      name: "New Staff",
      permissions: ["pos.ring_sales"],
      cached_at: new Date().toISOString(),
    });
    vi.mocked(loadCachedShift).mockResolvedValue({
      id: "current",
      shift_id: 42,
      staff_user_id: 1,
      opened_at: "2026-05-22T08:00:00.000Z",
      device_identifier: "POS-TEST",
      cached_at: new Date().toISOString(),
    });
    vi.mocked(loadCachedMenu).mockResolvedValue({
      id: "channel:takeaway",
      channel: "takeaway",
      categories: [],
      items: [{ id: 1 }],
      cached_at: new Date().toISOString(),
    });

    const result = await evaluateOfflineGate({ requireShift: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/different staff user/i);
  });
});
