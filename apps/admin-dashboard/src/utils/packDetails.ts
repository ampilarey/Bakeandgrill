/**
 * Saying what a purchase line was bought as. Owner, 2026-09-07: the receive
 * screen showed "16.0000" and nothing else, so whoever is standing at the
 * door with the boxes has to work out for themselves whether sixteen buns is
 * two packs of eight or one of sixteen.
 *
 * A line stores the pack as it was typed — `pack_name` "Case", `pack_size`
 * 210 base units each, `pack_quantity` 2 — while `quantity` and
 * `received_quantity` stay in base units, which is what the receive endpoint
 * takes. So these turn base units back into boxes for reading only; nothing
 * here changes what is sent.
 */
export type PackedLine = {
  pack_name?: string | null;
  pack_size?: number | string | null;
  pack_quantity?: number | string | null;
};

/** Trailing zeros off a stored decimal: 210.000000 reads as 210. */
export function tidyNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toFixed(4)));
}

/** How many base units are in one pack, or null when the line is not packed. */
export function packSizeOf(line: PackedLine): number | null {
  const size = Number(line.pack_size ?? 0);
  return Number.isFinite(size) && size > 0 ? size : null;
}

/**
 * What one pack is: "Case of 210 pcs". Null when the line was bought loose,
 * so a caller can leave the row alone rather than print an empty hint.
 */
export function describePack(line: PackedLine, unit?: string | null): string | null {
  const size = packSizeOf(line);
  if (size === null) return null;
  const name = (line.pack_name ?? '').trim() || 'pack';
  const per = unit?.trim() ? ` ${unit.trim()}` : '';
  return `${name} of ${tidyNumber(size)}${per}`;
}

/**
 * A base-unit count read back as boxes: 420 → "2 × Case", 435 → "2 × Case +
 * 15 pcs". Null when there is not a whole pack in it (a part-pack is already
 * shown in base units, and "0 × Case" tells nobody anything).
 */
export function asPacks(
  baseQuantity: number | string | null | undefined,
  line: PackedLine,
  unit?: string | null,
): string | null {
  const size = packSizeOf(line);
  const qty = Number(baseQuantity ?? 0);
  if (size === null || !Number.isFinite(qty) || qty <= 0) return null;

  const whole = Math.floor(qty / size);
  if (whole < 1) return null;

  const name = (line.pack_name ?? '').trim() || 'pack';
  // Rounded before comparing: 420 / 210 in floating point can leave a
  // remainder of 0.0000000001 and print "+ 0 pcs".
  const remainder = Number((qty - whole * size).toFixed(4));
  if (remainder === 0) return `${whole} × ${name}`;

  const per = unit?.trim() ? ` ${unit.trim()}` : '';
  return `${whole} × ${name} + ${tidyNumber(remainder)}${per}`;
}
