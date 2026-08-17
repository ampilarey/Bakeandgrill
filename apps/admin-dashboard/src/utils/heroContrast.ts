/**
 * Readability check for hero text over its own background.
 *
 * Owner asked for a contrast warning (2026-08-17) alongside the new colour
 * controls — with free colour choice it became easy to pick, say, gold text on
 * a cream box and only discover it on a phone in daylight. This is the standard
 * WCAG 2.x relative-luminance ratio, so the numbers mean the same thing they
 * mean everywhere else.
 */

export type ContrastVerdict = {
  ratio: number;
  /** WCAG AA for large text is 3:1; body text is 4.5:1. */
  level: 'good' | 'ok' | 'poor';
  message: string;
};

function parseColor(raw: string | null | undefined): [number, number, number, number] | null {
  const v = String(raw ?? '').trim();
  if (v === '') return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }

  const rgba = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+)\s*)?\)$/i.exec(v);
  if (rgba) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  }

  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Flatten a translucent colour onto what sits behind it, otherwise a 30%-alpha
 * box reads as far darker than it looks on the photo.
 */
function flatten(
  fg: [number, number, number, number],
  behind: [number, number, number, number],
): [number, number, number, number] {
  const a = fg[3];
  return [
    fg[0] * a + behind[0] * (1 - a),
    fg[1] * a + behind[1] * (1 - a),
    fg[2] * a + behind[2] * (1 - a),
    1,
  ];
}

/**
 * @param textColor  the text colour, or null when the stylesheet default is in force
 * @param bgColor    the element's background, or null when there is no box
 * @param fallbackText what the text is when nothing is chosen (usually white)
 * @param behind     what the box sits on — the photo, approximated as mid-grey
 */
export function heroContrast(
  textColor: string | null | undefined,
  bgColor: string | null | undefined,
  fallbackText = '#ffffff',
  behind = 'rgb(90,90,90)',
): ContrastVerdict | null {
  const text = parseColor(textColor) ?? parseColor(fallbackText);
  const rawBg = parseColor(bgColor);
  const base = parseColor(behind) ?? [90, 90, 90, 1];
  if (!text) return null;

  // No box means the text sits straight on the photo, which we cannot sample —
  // say nothing rather than invent a number the owner would have to trust.
  if (!rawBg) return null;

  const bg = flatten(rawBg, base);
  const l1 = luminance(text);
  const l2 = luminance(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  const rounded = Math.round(ratio * 10) / 10;

  if (ratio >= 4.5) {
    return { ratio: rounded, level: 'good', message: `Easy to read (${rounded}:1).` };
  }
  if (ratio >= 3) {
    return {
      ratio: rounded,
      level: 'ok',
      message: `Readable at heading size only (${rounded}:1). Too low for the subheading.`,
    };
  }
  return {
    ratio: rounded,
    level: 'poor',
    message: `Hard to read (${rounded}:1) — pick a lighter text or a darker background.`,
  };
}
