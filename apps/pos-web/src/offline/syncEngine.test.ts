import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  syncOfflineOrders: vi.fn(),
}));

vi.mock("./db", () => ({
  getPendingOfflineOrders: vi.fn(),
  updateOfflineOrder: vi.fn(),
  updateSyncLog: vi.fn(),
}));

import { syncOfflineOrders } from "../api";
import { getPendingOfflineOrders, updateOfflineOrder, updateSyncLog } from "./db";
import { runOfflineSync } from "./syncEngine";

const baseOrder = {
  local_order_id: "local-1",
  local_order_number: "OFF-1",
  device_identifier: "POS-TEST",
  shift_id: 1,
  created_at_local: "2026-05-22T10:00:00.000Z",
  type: "takeaway" as const,
  items: [{ item_id: 1, quantity: 1, unit_price: 25 }],
  totals: { subtotal: 25, tax: 2, total: 27 },
  payment: { method: "cash", amount: 27 },
  status: "pending" as const,
};

describe("runOfflineSync", () => {
  beforeEach(() => {
    vi.mocked(getPendingOfflineOrders).mockReset();
    vi.mocked(updateOfflineOrder).mockReset();
    vi.mocked(updateSyncLog).mockReset();
    vi.mocked(syncOfflineOrders).mockReset();
    vi.mocked(updateSyncLog).mockResolvedValue(undefined);
    vi.mocked(updateOfflineOrder).mockResolvedValue(undefined);
  });

  it("returns empty result when queue is clear", async () => {
    vi.mocked(getPendingOfflineOrders).mockResolvedValue([]);
    const result = await runOfflineSync(true);
    expect(result).toEqual({ synced: 0, failed: 0, conflicts: 0, remaining: 0 });
    expect(syncOfflineOrders).not.toHaveBeenCalled();
  });

  it("marks orders synced on happy path", async () => {
    vi.mocked(getPendingOfflineOrders)
      .mockResolvedValueOnce([baseOrder])
      .mockResolvedValueOnce([]);
    vi.mocked(syncOfflineOrders).mockResolvedValue({
      results: [
        {
          local_order_id: "local-1",
          status: "synced",
          server_order_id: 99,
          server_order_number: "BG-0099",
        },
      ],
    });

    const result = await runOfflineSync(true);
    expect(result.synced).toBe(1);
    expect(result.remaining).toBe(0);
    expect(updateOfflineOrder).toHaveBeenCalledWith(
      "local-1",
      expect.objectContaining({ status: "synced", server_order_id: 99 }),
    );
  });

  it("records conflict without throwing", async () => {
    vi.mocked(getPendingOfflineOrders)
      .mockResolvedValueOnce([baseOrder])
      .mockResolvedValueOnce([baseOrder]);
    vi.mocked(syncOfflineOrders).mockResolvedValue({
      results: [
        {
          local_order_id: "local-1",
          status: "conflict",
          message: "Duplicate ticket",
        },
      ],
    });

    const result = await runOfflineSync(true);
    expect(result.conflicts).toBe(1);
    expect(updateOfflineOrder).toHaveBeenCalledWith(
      "local-1",
      expect.objectContaining({ status: "conflict" }),
    );
  });

  it("backs off after network failure", async () => {
    vi.mocked(getPendingOfflineOrders)
      .mockResolvedValueOnce([baseOrder])
      .mockResolvedValueOnce([baseOrder]);
    vi.mocked(syncOfflineOrders).mockRejectedValue(new Error("Network down"));

    const result = await runOfflineSync(true);
    expect(result.failed).toBe(1);
    expect(updateSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({ last_error: "Network down" }),
    );
  });
});
