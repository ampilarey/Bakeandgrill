// GSM-7 segment counter shared by SMS Templates tab and Settings notifications.

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

export function smsCharCount(body: string): { chars: number; segments: number; encoding: string } {
  const gsm = isAllGsm7(body);
  const chars = [...body].length;
  if (chars === 0) return { chars: 0, segments: 0, encoding: gsm ? 'GSM-7' : 'Unicode' };
  if (gsm) {
    const septets = gsm7Septets(body);
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153);
    return { chars: septets, segments, encoding: 'GSM-7' };
  }
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { chars, segments, encoding: 'Unicode' };
}
