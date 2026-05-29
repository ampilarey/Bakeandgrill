export function formatTicketAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export type TicketAgeLevel = "ok" | "warn" | "critical";

/** Parked/held tickets: warn at 15m, critical at 30m. */
export function parkedTicketAgeLevel(iso: string | null | undefined): TicketAgeLevel {
  if (!iso) return "ok";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "ok";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m >= 30) return "critical";
  if (m >= 15) return "warn";
  return "ok";
}

export const PARKED_AGE_COLORS: Record<TicketAgeLevel, { color: string; bg: string; border: string }> = {
  ok: { color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
  warn: { color: "#C2410C", bg: "#FFF7ED", border: "#FDBA74" },
  critical: { color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
};
