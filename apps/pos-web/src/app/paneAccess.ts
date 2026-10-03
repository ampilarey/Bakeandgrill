import type { Pane } from "./types";

export type PaneAccessFlags = {
  shiftOpen: boolean;
  canRingSales: boolean;
  canViewReceipts: boolean;
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
 * Only ringing sales, active orders and kitchen receiving need an open
 * shift: they take money or move tickets. Receipts does not (owner,
 * 2026-10-03: "admin POS doesn't show receipts. He should be able to see
 * without opening the shifts"). Reading receipts touches no drawer, and
 * the two actions on one that do are gated on their own: a refund needs
 * an open shift, a tender correction needs its permission.
 */
export function computePaneAccess(f: PaneAccessFlags): Record<Pane, boolean> {
  return {
    sales: f.canRingSales && f.shiftOpen,
    receipts: f.canViewReceipts,
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
