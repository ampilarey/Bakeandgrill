import { describe, expect, it } from "vitest";
import { makeCartKey, resolvePackagingSnapshot } from "./useCart";

describe("resolvePackagingSnapshot", () => {
  it("uses default packaging option when present", () => {
    const snap = resolvePackagingSnapshot(
      {
        packaging_fee: 1,
        packaging_fee_mode: "per_unit",
        packaging_options: [
          { id: 10, name: "Small", fee: 2, is_default: false, sort_order: 0 },
          { id: 11, name: "Large", fee: 5, is_default: true, sort_order: 1 },
        ],
      },
      null,
    );
    expect(snap.packaging_option_id).toBe(11);
    expect(snap.packaging_fee).toBe(5);
    expect(snap.packaging_option_name).toBe("Large");
  });

  it("falls back to legacy packaging_fee", () => {
    const snap = resolvePackagingSnapshot(
      { packaging_fee: 3.5, packaging_fee_mode: "per_line", packaging_options: [] },
      null,
    );
    expect(snap.packaging_option_id).toBeNull();
    expect(snap.packaging_fee).toBe(3.5);
    expect(snap.packaging_fee_mode).toBe("per_line");
  });
});

describe("makeCartKey packaging", () => {
  it("keeps different packaging options as separate lines", () => {
    const a = makeCartKey(1, [], null, [], 10);
    const b = makeCartKey(1, [], null, [], 11);
    expect(a).not.toBe(b);
  });
});
