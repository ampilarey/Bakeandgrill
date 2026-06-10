import { describe, expect, it } from "vitest";
import { splitSelectedItemsTotal } from "./splitItemTotals";

describe("splitSelectedItemsTotal", () => {
  const items = [
    { id: 1, total_price: 1500 },
    { id: 2, total_price: "2500" },
    { id: 3, total_price: 500 },
  ];

  it("sums only selected item totals", () => {
    expect(splitSelectedItemsTotal(items, new Set([1, 2]))).toBe(4000);
  });

  it("treats missing total_price as zero", () => {
    expect(splitSelectedItemsTotal([{ id: 1 }, { id: 2, total_price: 100 }], new Set([1, 2]))).toBe(100);
  });

  it("returns zero when nothing selected", () => {
    expect(splitSelectedItemsTotal(items, new Set())).toBe(0);
  });
});
