import { beforeEach, describe, expect, it } from "vitest";
import { allocateOfflineOrderNumber } from "./offlineOrderNumber";
import { initOfflineDb, loadCachedShift, saveCachedShift } from "./db";

describe("offline IndexedDB writes", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("pos_offline_v1");
    await initOfflineDb();
  });

  it("increments offline order numbers in meta store", async () => {
    const n1 = await allocateOfflineOrderNumber("POS-IPAD-01");
    const n2 = await allocateOfflineOrderNumber("POS-IPAD-01");
    expect(n1).toMatch(/^OFF-[A-Z0-9]+-\d{8}-0001$/);
    expect(n2).toMatch(/^OFF-[A-Z0-9]+-\d{8}-0002$/);
  });

  it("persists cached shift under the current key", async () => {
    await saveCachedShift({
      shift_id: 42,
      staff_user_id: 7,
      opened_at: "2026-05-22T08:00:00.000Z",
      device_identifier: "POS-TEST",
    });
    const cached = await loadCachedShift();
    expect(cached?.shift_id).toBe(42);
    expect(cached?.staff_user_id).toBe(7);
  });
});
