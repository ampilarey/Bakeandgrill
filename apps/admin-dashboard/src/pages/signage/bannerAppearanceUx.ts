/** Pure helpers for Banner Appearance UX — no schema changes, presentation only. */

export type ThemeSwatch = { key: string; label: string; color: string };

export const FONT_SIZE_OPTIONS = [
  { label: 'Small', value: 0.8 },
  { label: 'Medium (default)', value: 1 },
  { label: 'Large', value: 1.3 },
  { label: 'Extra large', value: 1.6 },
] as const;

export const HEIGHT_SIZE_OPTIONS = [
  { label: 'Thin', value: 0.8 },
  { label: 'Normal', value: 1 },
  { label: 'Tall', value: 1.3 },
] as const;

/** Default transparency matching rgba(12, 8, 4, 0.78). */
export const DEFAULT_BG_TRANSPARENCY_PERCENT = 22;

/** Checkbox on → this inset; off → 0. */
export const EDGE_CLEAR_INSET_PERCENT = 3;

export type ParsedColor = { r: number; g: number; b: number; a: number };

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function parseCssColor(raw: string): ParsedColor | null {
  const s = (raw || '').trim();
  if (!s) return null;

  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h.split('').map((c) => c + c).join('');
    }
    if (h.length === 4) {
      h = h.split('').map((c) => c + c).join('');
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return { r, g, b, a: clamp01(a) };
      }
    }
    return null;
  }

  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    const a = rgb[4] != null ? Number(rgb[4]) : 1;
    if (![r, g, b, a].every((n) => Number.isFinite(n))) return null;
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: clamp01(a) };
  }

  return null;
}

export function toHex({ r, g, b }: Pick<ParsedColor, 'r' | 'g' | 'b'>): string {
  const part = (n: number) => clampByte(n).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Store opaque as hex; otherwise rgba with 2-decimal alpha. */
export function formatStoredColor(color: ParsedColor): string {
  if (color.a >= 0.999) return toHex(color);
  const a = Math.round(color.a * 100) / 100;
  return `rgba(${clampByte(color.r)}, ${clampByte(color.g)}, ${clampByte(color.b)}, ${a})`;
}

export function composeFromPicker(hex: string, alpha: number): string {
  const parsed = parseCssColor(hex) ?? { r: 12, g: 8, b: 4, a: 1 };
  return formatStoredColor({ ...parsed, a: clamp01(alpha) });
}

export function alphaToTransparencyPercent(alpha: number): number {
  return Math.round((1 - clamp01(alpha)) * 100);
}

export function transparencyPercentToAlpha(percent: number): number {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return clamp01(1 - p / 100);
}

/** True when two CSS colour strings resolve to the same RGBA (ignoring formatting). */
export function colorsMatch(a: string, b: string): boolean {
  const pa = parseCssColor(a);
  const pb = parseCssColor(b);
  if (!pa || !pb) return a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    pa.r === pb.r
    && pa.g === pb.g
    && pa.b === pb.b
    && Math.abs(pa.a - pb.a) < 0.01
  );
}

/** True when RGB matches (alpha ignored) — for swatch highlight with transparency. */
export function rgbMatch(a: string, b: string): boolean {
  const pa = parseCssColor(a);
  const pb = parseCssColor(b);
  if (!pa || !pb) return false;
  return pa.r === pb.r && pa.g === pb.g && pa.b === pb.b;
}

/**
 * Nearest preset for display only — does not rewrite storage.
 */
export function nearestPresetValue(
  stored: number,
  options: ReadonlyArray<{ value: number }>,
): number {
  const v = Number(stored);
  if (!Number.isFinite(v) || options.length === 0) return options[0]?.value ?? 1;
  let best = options[0].value;
  let bestDist = Math.abs(best - v);
  for (const opt of options) {
    const d = Math.abs(opt.value - v);
    if (d < bestDist) {
      best = opt.value;
      bestDist = d;
    }
  }
  return best;
}

export function themeSwatches(theme: Record<string, string | undefined>): ThemeSwatch[] {
  const bg = theme.background || '#1C1408';
  const surface = theme.surface || '#2A2118';
  const primary = theme.primary || '#D4813A';
  const text = theme.text || '#FFF8F0';
  const muted = theme.muted || '#C4B5A5';
  return [
    { key: 'background', label: 'Board', color: bg },
    { key: 'surface', label: 'Surface', color: surface },
    { key: 'primary', label: 'Accent', color: primary },
    { key: 'text', label: 'Text', color: text },
    { key: 'muted', label: 'Muted', color: muted },
    { key: 'black', label: 'Black', color: '#000000' },
    { key: 'white', label: 'White', color: '#ffffff' },
  ];
}

export function edgeClearChecked(insetPercent: number): boolean {
  return Number(insetPercent) > 0;
}
