// GSM-7 segment counter shared by admin dashboard and POS ops panel.

const GSM7_BASE = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function isAllGsm7(body: string): boolean {
  for (const ch of body) {
    if (!GSM7_BASE.includes(ch) && !GSM7_EXT.includes(ch)) return false;
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
