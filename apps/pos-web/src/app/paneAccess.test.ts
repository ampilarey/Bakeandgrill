import { describe, expect, it } from "vitest";
import { computePaneAccess, type PaneAccessFlags } from "./paneAccess";

const none: PaneAccessFlags = {
  shiftOpen: false,
  canRingSales: false, canViewReceipts: false, canViewActiveOrders: false,
  canOpenShift: false, canCloseShift: false, canViewShiftHistory: false, canViewReports: false,
  canAccessOps: false, canManageExpenses: false, canViewCustomers: false,
  canViewOwnPurchaseRequests: false, canBuyAssigned: false, canReceiveDeliveries: false,
  canKitchenReceive: false, canTradeDispatch: false, canTradeReconcile: false,
};

describe("computePaneAccess", () => {
  it("opens Receipts on the permission alone, with no shift open", () => {
    // Owner, 2026-10-03: "admin POS doesn't show receipts. He should be able
    // to see without opening the shifts."
    const owner = computePaneAccess({ ...none, canViewReceipts: true, canAccessOps: true, canRingSales: true, canViewActiveOrders: true });
    expect(owner.receipts).toBe(true);
    expect(owner.sales).toBe(false);
    expect(owner.open_tickets).toBe(false);
    expect(owner.ops).toBe(true);
  });

  it("keeps the panes that take money or move tickets behind an open shift", () => {
    const flags = { ...none, canRingSales: true, canViewActiveOrders: true, canKitchenReceive: true, canViewReceipts: true };
    const closed = computePaneAccess(flags);
    expect(closed.sales).toBe(false);
    expect(closed.open_tickets).toBe(false);
    expect(closed.kitchen_receiving).toBe(false);
    const open = computePaneAccess({ ...flags, shiftOpen: true });
    expect(open.sales).toBe(true);
    expect(open.open_tickets).toBe(true);
    expect(open.kitchen_receiving).toBe(true);
  });

  it("never opens Receipts without the permission, shift or not", () => {
    expect(computePaneAccess({ ...none, shiftOpen: true }).receipts).toBe(false);
  });
});
