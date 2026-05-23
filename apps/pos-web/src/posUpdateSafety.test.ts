import { describe, expect, it } from "vitest";
import { isNewerPosBuild, isPosUpdateBlocked } from "./posUpdateSafety";

describe("posUpdateSafety", () => {
  const local = {
    version: "1.0.0",
    build: "2026-05-22-120000-abc1234",
    commit: "abc1234",
    built_at: "2026-05-22T12:00:00.000Z",
  };

  it("detects newer server build", () => {
    expect(
      isNewerPosBuild({ ...local, build: "2026-05-22-130000-def5678" }, local),
    ).toBe(true);
  });

  it("treats matching build as up to date", () => {
    expect(isNewerPosBuild(local, local)).toBe(false);
  });

  it("blocks update during charge overlay", () => {
    expect(
      isPosUpdateBlocked({
        cartHasItems: false,
        resumedOrderId: null,
        isEditingActive: false,
        showCharge: true,
        showSendBill: false,
        showSaveTicket: false,
        showOpenShift: false,
        showCloseShift: false,
        showPreferences: false,
        isSubmitting: false,
        pendingPaymentForOrderId: null,
        offlineQueueCount: 0,
        offlinePendingCount: 0,
        shiftCashFormOpen: false,
      }),
    ).toBe(true);
  });

  it("allows update when idle", () => {
    expect(
      isPosUpdateBlocked({
        cartHasItems: false,
        resumedOrderId: null,
        isEditingActive: false,
        showCharge: false,
        showSendBill: false,
        showSaveTicket: false,
        showOpenShift: false,
        showCloseShift: false,
        showPreferences: false,
        isSubmitting: false,
        pendingPaymentForOrderId: null,
        offlineQueueCount: 0,
        offlinePendingCount: 0,
        shiftCashFormOpen: false,
      }),
    ).toBe(false);
  });
});
