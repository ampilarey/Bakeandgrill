import { describe, expect, it } from "vitest";
import { splitSelectedItemsTotal } from "./splitItemTotals";

describe("splitSelectedItemsTotal", () => {
  const items = [
    { id: 1, total_price: 15 },
    { id: 2, total_price: "25" },
    { id: 3, total_price: 10 },
  ];

  it("sums only selected item totals when no order total given", () => {
    expect(splitSelectedItemsTotal(items, new Set([1, 2]))).toBe(40);
  });

  it("allocates order grand total by line share", () => {
    // Lines 15+25+10=50; pick 15+25=40 → 80% of order total 54 → 43.2
    expect(splitSelectedItemsTotal(items, new Set([1, 2]), 54)).toBe(43.2);
  });

  it("treats missing total_price as zero", () => {
    expect(splitSelectedItemsTotal([{ id: 1 }, { id: 2, total_price: 100 }], new Set([1, 2]))).toBe(100);
  });

  it("returns zero when nothing selected", () => {
    expect(splitSelectedItemsTotal(items, new Set())).toBe(0);
  });
});
