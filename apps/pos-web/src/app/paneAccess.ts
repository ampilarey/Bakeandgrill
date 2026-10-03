import type { Pane } from "./types";

export type PaneAccessFlags = {
  shiftOpen: boolean;
  canRingSales: boolean;
  canViewReceipts: boolean;
  /** pos.view_all_station_orders: receipts from every till, shift or no shift. */
  canViewAllTills: boolean;
  canViewActiveOrders: boolean;
  canOpenShift: boolean;
  canCloseShift: boolean;
  canViewShiftHistory: boolean;
  canViewReports: boolean;
  canAccessOps: boolean;
  canManageExpenses: boolean;
  canViewCustomers: boolean;
  canViewOwnPurchaseRequests: boolean;
  canBuyAssigned: boolean;
  canReceiveDeliveries: boolean;
  canKitchenReceive: boolean;
  canTradeDispatch: boolean;
  canTradeReconcile: boolean;
};

/**
 * Which panes the signed-in person may open right now. One place, so the
 * side drawer, the pane fallback and the cross-links all agree.
 *
 * Ringing sales, active orders and kitchen receiving need an open shift:
 * they take money or move tickets.
 *
 * Receipts, owner 2026-10-03: whoever may view all tills sees them with
 * or without a shift ("he should be able to see without opening the
 * shifts"). A cashier sees Receipts only while their shift is open, and
 * then only that shift's ("if the shift is closed he should not see the
 * receipts, and when a new shift is opened he should see new shift
 * receipts only"). The server scopes the cashier the same way.
 */
export function computePaneAccess(f: PaneAccessFlags): Record<Pane, boolean> {
  return {
    sales: f.canRingSales && f.shiftOpen,
    receipts: f.canViewReceipts && (f.shiftOpen || f.canViewAllTills),
    open_tickets: f.canViewActiveOrders && f.shiftOpen,
    events: true,
    shift: f.shiftOpen || f.canOpenShift || f.canCloseShift,
    shift_history: f.canViewShiftHistory,
    sales_report: f.canViewReports,
    ops: f.canAccessOps,
    expenses: f.canManageExpenses,
    customers: f.canViewCustomers,
    my_requests: f.canViewOwnPurchaseRequests,
    buying_list: f.canBuyAssigned,
    to_receive: f.canReceiveDeliveries,
    kitchen_receiving: f.canKitchenReceive && f.shiftOpen,
    wholesale_dispatch: f.canTradeDispatch,
    wholesale_reconcile: f.canTradeReconcile,
  };
}
