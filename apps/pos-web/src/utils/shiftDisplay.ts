/**
 * Open-shift UI must not leak the expected drawer total to the person
 * counting cash. Manager/owner may still see the full reconciliation.
 */
export function canSeeOpenShiftExpectedCash(role: string | null | undefined): boolean {
  const slug = (role ?? "").toLowerCase().trim();
  return slug === "owner" || slug === "manager";
}

/** Persistent chrome label — identifies the shift without a cash figure. */
export function formatOpenShiftLabel(shiftId: number, openedAt: string | null | undefined): string {
  const when = formatShiftOpenedAt(openedAt);
  return when ? `Shift #${shiftId} · opened ${when}` : `Shift #${shiftId}`;
}

export function formatShiftOpenedAt(openedAt: string | null | undefined): string {
  if (!openedAt) return "";
  try {
    return new Date(openedAt).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}
