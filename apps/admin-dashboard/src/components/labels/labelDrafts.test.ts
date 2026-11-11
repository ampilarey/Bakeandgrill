import { describe, expect, it } from 'vitest';
import { inHouseBarcode } from './labelDrafts';

describe('inHouseBarcode', () => {
  it("makes twelve digits in the range kept for a shop's own use", () => {
    const code = inHouseBarcode();
    expect(code).toMatch(/^2\d{11}$/);
    expect(inHouseBarcode(() => 0.999999)).toBe('299999999999');
    expect(inHouseBarcode(() => 0)).toBe('200000000000');
    expect(inHouseBarcode()).not.toBe(inHouseBarcode());
  });
});
