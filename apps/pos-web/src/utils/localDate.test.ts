import { describe, expect, it } from "vitest";
import { localDateYmd } from "./localDate";

describe("localDateYmd", () => {
  it("uses local calendar fields, not UTC", () => {
    // 2026-07-16 19:30 UTC == 2026-07-17 00:30 in Maldives (UTC+5)
    const d = new Date("2026-07-16T19:30:00.000Z");
    // In environments whose local offset is UTC+5 this is July 17;
    // elsewhere we still assert it matches getFullYear/Month/Date.
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(localDateYmd(d)).toBe(expected);
    expect(localDateYmd(d)).not.toBe(d.toISOString().slice(0, 10));
  });
});
