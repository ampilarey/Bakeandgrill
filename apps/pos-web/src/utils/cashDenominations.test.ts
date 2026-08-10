import { describe, expect, it } from "vitest";
import {
  breakdownPayload,
  fromLaari,
  hasAnyDenomEntry,
  parseCount,
  totalLaariFromCounts,
} from "./cashDenominations";

describe("cashDenominations", () => {
  it("multiplies and sums in laari including rare and 25/50 laari coins", () => {
    const total = totalLaariFromCounts({
      50_000: "3",
      10_000: "7",
      5_000: "4",
      50: "2",
      25: "1",
      10: "1",
      1: "1",
    });
    expect(total).toBe(
      3 * 50_000 + 7 * 10_000 + 4 * 5_000 + 2 * 50 + 25 + 10 + 1,
    );
    expect(total).toBe(240_136);
    expect(fromLaari(total)).toBe(2401.36);
  });

  it("treats empty denomination boxes as zero", () => {
    expect(totalLaariFromCounts({})).toBe(0);
    expect(parseCount("")).toBe(0);
    expect(parseCount(undefined)).toBe(0);
    expect(totalLaariFromCounts({ 100_000: "", 50_000: "1" })).toBe(50_000);
    expect(hasAnyDenomEntry({})).toBe(false);
    expect(hasAnyDenomEntry({ 100: "" })).toBe(false);
    expect(hasAnyDenomEntry({ 100: "0" })).toBe(true);
  });

  it("omits zeros from the breakdown payload", () => {
    expect(breakdownPayload({ 10_000: "2", 500: "0", 25: "1" })).toEqual({
      "10000": 2,
      "25": 1,
    });
  });
});
