/**
 * Code 128 (subset B) for shelf labels.
 *
 * Stock received by scan (2026-09-03) matches a purchase line by the
 * supplier's barcode, then by SKU. Wholesale packets carry an EAN; house-made
 * and repacked items carry nothing, so their SKU is printed here as a barcode
 * a wedge reader or the camera can read. Subset B covers ASCII 32–127, which
 * is every SKU this system generates; digits-only codes are not packed into
 * subset C because label width is not a constraint at these lengths.
 *
 * The module widths come from the Code 128 specification; the test decodes
 * the rendered bars with the same zxing build the scanner uses.
 */

/** Bar/space widths for symbol values 0–105, then the stop pattern (106). */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Symbol values for `text` in subset B, checksum and stop included. */
export function code128Symbols(text: string): number[] {
  if (text.length === 0) throw new Error('Code 128: nothing to encode');
  const values = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Code 128 subset B cannot encode "${ch}"`);
    }
    values.push(code - 32);
  }
  let checksum = START_B;
  for (let i = 1; i < values.length; i += 1) checksum += values[i] * i;
  values.push(checksum % 103);
  values.push(STOP);
  return values;
}

/**
 * Bars as [x, width] pairs in module units, black only, with no quiet zone.
 * Total width is the last bar's end.
 */
export function code128Bars(text: string): { bars: Array<[number, number]>; width: number } {
  const bars: Array<[number, number]> = [];
  let x = 0;
  for (const value of code128Symbols(text)) {
    const pattern = PATTERNS[value];
    for (let i = 0; i < pattern.length; i += 1) {
      const w = Number(pattern[i]);
      if (i % 2 === 0) bars.push([x, w]);
      x += w;
    }
  }
  return { bars, width: x };
}

export interface Code128SvgOptions {
  /** Pixels per module. */
  module?: number;
  /** Bar height in pixels. */
  height?: number;
  /** Quiet zone on each side, in modules (spec minimum is 10). */
  quiet?: number;
}

/** Inline SVG markup, black bars on white, quiet zones included. */
export function code128Svg(text: string, options: Code128SvgOptions = {}): string {
  const module = options.module ?? 2;
  const height = options.height ?? 48;
  const quiet = options.quiet ?? 10;
  const { bars, width } = code128Bars(text);
  const total = (width + quiet * 2) * module;
  const rects = bars
    .map(([x, w]) => `<rect x="${(x + quiet) * module}" y="0" width="${w * module}" height="${height}"/>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height}" ` +
    `viewBox="0 0 ${total} ${height}" shape-rendering="crispEdges" role="img" aria-label="${escapeAttr(text)}">` +
    `<rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`
  );
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
