import { describe, expect, it } from "vitest";
import { localDateYmd } from "./localDate";

describe("localDateYmd", () => {
  it("uses Maldives calendar day, not UTC", () => {
    // 2026-07-16 19:30 UTC == 2026-07-17 00:30 in Maldives (UTC+5)
    const d = new Date("2026-07-16T19:30:00.000Z");
    expect(localDateYmd(d)).toBe("2026-07-17");
    expect(d.toISOString().slice(0, 10)).toBe("2026-07-16");
  });

  it("stays on the same Maldives day before UTC midnight rolls", () => {
    // 2026-07-17 18:30 UTC == 2026-07-17 23:30 Maldives
    const d = new Date("2026-07-17T18:30:00.000Z");
    expect(localDateYmd(d)).toBe("2026-07-17");
  });
});
