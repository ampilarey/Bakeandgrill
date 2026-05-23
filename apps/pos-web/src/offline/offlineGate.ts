import {
  ensureCachedStaffSession,
  loadCachedMenu,
  loadCachedShift,
  type CachedMenuRecord,
  type CachedShiftRecord,
  type CachedStaffSession,
} from "./db";

export type OfflineGateResult = {
  allowed: boolean;
  reason: string | null;
  menu: CachedMenuRecord | null;
  shift: CachedShiftRecord | null;
  session: CachedStaffSession | null;
};

export async function evaluateOfflineGate(): Promise<OfflineGateResult> {
  const token = localStorage.getItem("pos_token");
  const session = await ensureCachedStaffSession();
  const shift = await loadCachedShift();
  const menu = await loadCachedMenu();

  if (!token) {
    return { allowed: false, reason: "Staff session expired. Log in when online.", menu, shift, session };
  }

  if (!session) {
    return { allowed: false, reason: "No cached staff session. Connect once while online.", menu, shift, session };
  }

  if (!shift?.shift_id || !shift.opened_at) {
    return { allowed: false, reason: "No cached open shift. Open a shift while online.", menu, shift, session };
  }

  if (!menu?.items?.length) {
    return { allowed: false, reason: "No cached menu. Connect while online to download the menu.", menu, shift, session };
  }

  return { allowed: true, reason: null, menu, shift, session };
}

export function hasOfflineBootstrap(): boolean {
  return !!localStorage.getItem("pos_offline_bootstrapped");
}

export function markOfflineBootstrap(): void {
  localStorage.setItem("pos_offline_bootstrapped", new Date().toISOString());
}
