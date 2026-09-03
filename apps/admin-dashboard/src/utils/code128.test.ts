import { describe, expect, it } from 'vitest';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';
import { code128Bars, code128Svg, code128Symbols } from './code128';

/** Rasterise the bars into a luminance row and decode it with zxing — the same reader the scanner uses. */
function decode(text: string): string {
  const scale = 3;
  const quiet = 10;
  const { bars, width } = code128Bars(text);
  const w = (width + quiet * 2) * scale;
  const h = 12;
  const row = new Uint8ClampedArray(w).fill(255);
  for (const [x, bw] of bars) {
    for (let i = 0; i < bw * scale; i += 1) row[(x + quiet) * scale + i] = 0;
  }
  const image = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) image.set(row, y * w);

  const source = new RGBLuminanceSource(image, w, h);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  reader.setHints(hints);
  return reader.decode(bitmap).getText();
}

describe('code128', () => {
  it('uses the specification checksum (weighted sum mod 103)', () => {
    // Start B (104) + P(48)·1 + J(42)·2 + J(42)·3 + 1(17)·4 + 2(18)·5 + 3(19)·6 + C(35)·7 = 879; 879 mod 103 = 55.
    const symbols = code128Symbols('PJJ123C');
    expect(symbols[0]).toBe(104);
    expect(symbols[symbols.length - 1]).toBe(106);
    expect(symbols[symbols.length - 2]).toBe(879 % 103);
  });

  it('round-trips SKUs, EANs and mixed text through the zxing reader', () => {
    for (const text of ['FLR-25', 'BTR-1', '8801234567890', 'Coke 330ml', 'A', 'x-9_Z/2']) {
      expect(decode(text)).toBe(text);
    }
  });

  it('refuses control characters and empty input', () => {
    expect(() => code128Symbols('')).toThrow();
    expect(() => code128Symbols('a\tb')).toThrow(/cannot encode/);
  });

  it('renders SVG with quiet zones and an accessible label', () => {
    const svg = code128Svg('FLR-25', { module: 2, height: 40, quiet: 10 });
    const { width } = code128Bars('FLR-25');
    expect(svg).toContain(`width="${(width + 20) * 2}"`);
    expect(svg).toContain('aria-label="FLR-25"');
    expect(svg).toContain('<rect x="20"'); // first bar starts after the quiet zone
  });
});
