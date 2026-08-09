import { describe, expect, it } from "vitest";
import { canSeeOpenShiftExpectedCash, formatOpenShiftLabel } from "./shiftDisplay";

describe("canSeeOpenShiftExpectedCash", () => {
  it("allows owner and manager", () => {
    expect(canSeeOpenShiftExpectedCash("owner")).toBe(true);
    expect(canSeeOpenShiftExpectedCash("manager")).toBe(true);
    expect(canSeeOpenShiftExpectedCash("Owner")).toBe(true);
  });

  it("hides from staff / cashier roles", () => {
    expect(canSeeOpenShiftExpectedCash("staff")).toBe(false);
    expect(canSeeOpenShiftExpectedCash("cashier")).toBe(false);
    expect(canSeeOpenShiftExpectedCash("")).toBe(false);
    expect(canSeeOpenShiftExpectedCash(null)).toBe(false);
  });
});

describe("formatOpenShiftLabel", () => {
  it("identifies the shift without a cash total", () => {
    const label = formatOpenShiftLabel(42, "2026-08-09T08:15:00+00:00");
    expect(label).toContain("Shift #42");
    expect(label).toMatch(/opened/i);
    expect(label).not.toMatch(/MVR/i);
    expect(label).not.toMatch(/drawer/i);
    expect(label).not.toMatch(/350/);
  });
});
