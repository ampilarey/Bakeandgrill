/**
 * Maldivian rufiyaa denominations for blind drawer counts.
 * All face values are integer laari (1 MVR = 100 laari).
 */

export const NOTE_DENOMS_LAARI = [100_000, 50_000, 10_000, 5_000, 2_000, 1_000, 500] as const;
export const COMMON_COIN_DENOMS_LAARI = [200, 100, 50, 25] as const;
export const RARE_COIN_DENOMS_LAARI = [20, 10, 5, 2, 1] as const;

/**
 * Default drawer faces for the close-shift count. The MVR 1000 note is very
 * rare in this till, so it lives with the rare coins behind
 * "More notes & coins" — keeping the default list to ten rows that fit a
 * phone and an iPad without scrolling.
 */
export const DEFAULT_NOTE_DENOMS_LAARI = [50_000, 10_000, 5_000, 2_000, 1_000, 500] as const;
export const MORE_DENOMS_LAARI = [100_000, ...RARE_COIN_DENOMS_LAARI] as const;

export const ALL_DENOMS_LAARI = [
  ...NOTE_DENOMS_LAARI,
  ...COMMON_COIN_DENOMS_LAARI,
  ...RARE_COIN_DENOMS_LAARI,
] as const;

export type CashCountMethod = "denominations" | "plain_total";

export type DenomCounts = Partial<Record<number, string>>;

export type ForeignCurrencyRow = {
  currency: string;
  denomination: string;
  count: string;
  accepted_mvr: string;
};

export function labelForLaari(laari: number): string {
  if (laari >= 100 && laari % 100 === 0) return `MVR ${laari / 100}`;
  if (laari === 50) return "50 laari";
  if (laari === 25) return "25 laari";
  if (laari === 20) return "20 laari";
  if (laari === 10) return "10 laari";
  if (laari === 5) return "5 laari";
  if (laari === 1) return "1 laari";
  return `${laari} laari`;
}

/** Parse a count box: empty → 0. */
export function parseCount(raw: string | undefined | null): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Sum count × face in laari. Empty boxes are zero. */
export function totalLaariFromCounts(counts: DenomCounts): number {
  let total = 0;
  for (const face of ALL_DENOMS_LAARI) {
    total += face * parseCount(counts[face]);
  }
  return total;
}

export function fromLaari(laari: number): number {
  return laari / 100;
}

export function toLaari(mvr: number): number {
  return Math.round(mvr * 100);
}

/** Compact payload: only non-zero counts, string keys for JSON. */
export function breakdownPayload(counts: DenomCounts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const face of ALL_DENOMS_LAARI) {
    const c = parseCount(counts[face]);
    if (c > 0) out[String(face)] = c;
  }
  return out;
}

export function hasAnyDenomEntry(counts: DenomCounts): boolean {
  return ALL_DENOMS_LAARI.some((face) => (counts[face] ?? "").trim() !== "");
}

export function formatForeignHeldSummary(
  rows: Array<{ currency: string; denomination: number; count: number }>,
): string {
  if (!rows.length) return "";
  const byCur = new Map<string, number>();
  for (const r of rows) {
    const amt = Number(r.denomination) * Number(r.count);
    byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + amt);
  }
  return Array.from(byCur.entries())
    .map(([cur, amt]) => `${cur} ${amt % 1 === 0 ? amt.toFixed(0) : amt.toFixed(2)} held`)
    .join(" · ");
}
