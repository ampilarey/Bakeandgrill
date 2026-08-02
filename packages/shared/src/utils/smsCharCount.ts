// GSM-7 segment counter shared by admin dashboard and POS ops panel.

const GSM7_BASE = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

const CHAR_LABELS: Record<string, string> = {
  '\u2014': 'em dash (—)',
  '\u2013': 'en dash (–)',
  '\u2018': 'curly quote (‘)',
  '\u2019': 'curly quote (’)',
  '\u201C': 'curly quote (“)',
  '\u201D': 'curly quote (”)',
  '\u2026': 'ellipsis (…)',
  '\u00A0': 'non-breaking space',
};

function isGsm7Char(ch: string): boolean {
  return GSM7_BASE.includes(ch) || GSM7_EXT.includes(ch);
}

function isAllGsm7(body: string): boolean {
  for (const ch of body) {
    if (!isGsm7Char(ch)) return false;
  }
  return true;
}

function gsm7Septets(body: string): number {
  let n = 0;
  for (const ch of body) n += GSM7_EXT.includes(ch) ? 2 : 1;
  return n;
}

export type SmsCharCount = {
  chars: number;
  segments: number;
  encoding: string;
  isUnicode: boolean;
  charsPerSeg: number;
  remaining: number;
};

/** Unique non-GSM-7 characters in body, with human-readable labels where known. */
export function nonGsm7Characters(body: string): Array<{ char: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ char: string; label: string }> = [];
  for (const ch of body) {
    if (isGsm7Char(ch) || seen.has(ch)) continue;
    seen.add(ch);
    out.push({ char: ch, label: CHAR_LABELS[ch] ?? `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} (${ch})` });
  }
  return out;
}

export function smsCharCount(body: string): SmsCharCount {
  const gsm = isAllGsm7(body);
  const codePoints = [...body].length;
  if (codePoints === 0) {
    return { chars: 0, segments: 0, encoding: 'GSM-7', isUnicode: false, charsPerSeg: 160, remaining: 160 };
  }
  if (gsm) {
    const septets = gsm7Septets(body);
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153);
    const charsPerSeg = segments === 1 ? 160 : 153;
    const used = septets % charsPerSeg || charsPerSeg;
    return {
      chars: septets,
      segments,
      encoding: 'GSM-7',
      isUnicode: false,
      charsPerSeg,
      remaining: charsPerSeg - used,
    };
  }
  const segments = codePoints <= 70 ? 1 : Math.ceil(codePoints / 67);
  const charsPerSeg = segments === 1 ? 70 : 67;
  const used = codePoints % charsPerSeg || charsPerSeg;
  return {
    chars: codePoints,
    segments,
    encoding: 'Unicode',
    isUnicode: true,
    charsPerSeg,
    remaining: charsPerSeg - used,
  };
}
