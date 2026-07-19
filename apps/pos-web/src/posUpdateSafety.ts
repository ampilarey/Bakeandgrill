/** States where a reload would interrupt sales, payments, or shift ops. */
export type PosUpdateBlockers = {
  cartHasItems: boolean;
  /** Kept for callers; empty-cart resume alone does not block updates. */
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
  // Do not block on resumedOrderId / isEditingActive alone. Opening an
  // Active Order then Clear leaves those flags set with an empty cart;
  // reload is safe (server ticket stays in Orders). Still block when the
  // cart has lines or a payment/shift modal is open.
  return (
    blockers.cartHasItems
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

const PLACEHOLDER_COMMITS = new Set(["abc1234", "dev", "placeholder"]);

function isPlaceholderBuild(info: PosVersionInfo): boolean {
  return PLACEHOLDER_COMMITS.has(info.commit) || info.build.includes("-abc1234");
}

/** True when the server reports a different deploy than this bundle. */
export function isNewerPosBuild(
  server: PosVersionInfo,
  local: PosVersionInfo,
): boolean {
  // Stale placeholder pos-version.json on server must not nag staff every session.
  if (isPlaceholderBuild(server)) return false;
  if (server.build !== local.build) return true;
  if (server.commit !== local.commit && !PLACEHOLDER_COMMITS.has(server.commit)) return true;
  if (server.version !== local.version) return true;
  return false;
}
