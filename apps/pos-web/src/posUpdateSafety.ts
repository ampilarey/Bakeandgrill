/** States where a reload would interrupt sales, payments, or shift ops. */
export type PosUpdateBlockers = {
  cartHasItems: boolean;
  resumedOrderId: number | null;
  isEditingActive: boolean;
  showCharge: boolean;
  showSendBill: boolean;
  showSaveTicket: boolean;
  showOpenShift: boolean;
  showCloseShift: boolean;
  showPreferences: boolean;
  isSubmitting: boolean;
  pendingPaymentForOrderId: number | null;
  offlineQueueCount: number;
  offlinePendingCount: number;
  shiftCashFormOpen: boolean;
};

export function isPosUpdateBlocked(blockers: PosUpdateBlockers): boolean {
  return (
    blockers.cartHasItems
    || blockers.resumedOrderId !== null
    || blockers.isEditingActive
    || blockers.showCharge
    || blockers.showSendBill
    || blockers.showSaveTicket
    || blockers.showOpenShift
    || blockers.showCloseShift
    || blockers.showPreferences
    || blockers.isSubmitting
    || blockers.pendingPaymentForOrderId !== null
    || blockers.offlineQueueCount > 0
    || blockers.offlinePendingCount > 0
    || blockers.shiftCashFormOpen
  );
}

export type PosVersionInfo = {
  version: string;
  build: string;
  commit: string;
  built_at: string;
};

/** True when the server reports a different deploy than this bundle. */
export function isNewerPosBuild(
  server: PosVersionInfo,
  local: PosVersionInfo,
): boolean {
  if (server.build !== local.build) return true;
  if (server.commit !== local.commit && server.commit !== "dev") return true;
  if (server.version !== local.version) return true;
  return false;
}
