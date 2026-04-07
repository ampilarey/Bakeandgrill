/**
 * GSM-7 extended charset check.
 * Returns true if the message contains characters outside GSM-7 (requires UCS-2 / Unicode encoding).
 * Unicode single-segment = 70 chars; multi-segment = 67 chars/part.
 * GSM-7 single-segment = 160 chars; multi-segment = 153 chars/part.
 */
const NON_GSM_REGEX = /[^\u0000-\u007F\u00A0-\u00FF\u20AC\u0160\u0161\u017D\u017E\u0152\u0153\u0178]/;

export function isNonGsm(text: string): boolean {
  return NON_GSM_REGEX.test(text);
}

export interface SmsSegmentInfo {
  segments: number;
  charsPerSeg: number;
  remaining: number;
  isUnicode: boolean;
}

export function smsSegmentInfo(text: string): SmsSegmentInfo {
  const unicode    = isNonGsm(text);
  const singleMax  = unicode ? 70  : 160;
  const multiMax   = unicode ? 67  : 153;
  const len        = text.length;
  const segments   = len <= singleMax ? 1 : Math.ceil(len / multiMax);
  const charsPerSeg = segments === 1 ? singleMax : multiMax;
  const used       = len % charsPerSeg || charsPerSeg;
  const remaining  = charsPerSeg - used;

  return { segments, charsPerSeg, remaining, isUnicode: unicode };
}
