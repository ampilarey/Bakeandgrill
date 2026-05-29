export function elapsed(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function urgencyColor(iso: string): { solid: string; faint: string } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { solid: "#22c55e", faint: "rgba(34,197,94,0.13)" };
  const m = Math.floor((Date.now() - t) / 60000);
  if (m >= 15) return { solid: "#ef4444", faint: "rgba(239,68,68,0.13)" };
  if (m >= 8) return { solid: "#f97316", faint: "rgba(249,115,22,0.13)" };
  return { solid: "#22c55e", faint: "rgba(34,197,94,0.13)" };
}

export function isLateTicket(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Math.floor((Date.now() - t) / 60000) >= 15;
}
