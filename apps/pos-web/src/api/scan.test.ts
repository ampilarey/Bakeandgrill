import { describe, expect, it } from "vitest";
import { looksLikeScanCode, normalizeScannedCode } from "./scan";

describe("normalizeScannedCode", () => {
  it("pulls a gift card code out of a link and upper-cases it", () => {
    expect(normalizeScannedCode("https://bakeandgrill.mv/gift-cards/view/gc-20260902-0007?x=1")).toBe("GC-20260902-0007");
    expect(normalizeScannedCode("  8801234567890 ")).toBe("8801234567890");
  });
});

describe("looksLikeScanCode", () => {
  it("knows a card code from a menu search", () => {
    expect(looksLikeScanCode("DC-AB12-CD34")).toBe(true);
    expect(looksLikeScanCode("gc-20260902-0007")).toBe(true);
    expect(looksLikeScanCode("BG-C-7771234")).toBe(true);
    expect(looksLikeScanCode("WELCOME10")).toBe(true);
    expect(looksLikeScanCode("chicken roll")).toBe(false);
    expect(looksLikeScanCode("tea")).toBe(false);
  });
});
