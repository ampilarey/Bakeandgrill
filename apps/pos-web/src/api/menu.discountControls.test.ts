import { describe, expect, it } from "vitest";
import {
  computeEffectiveDiscountCapMvr,
  DEFAULT_POS_DISCOUNT_CONTROLS,
  normalizePosDiscountControls,
  validateManualDiscountInput,
} from "../api/menu";

describe("normalizePosDiscountControls", () => {
  it("returns safe defaults for missing/invalid payload", () => {
    expect(normalizePosDiscountControls(null)).toEqual(DEFAULT_POS_DISCOUNT_CONTROLS);
    expect(normalizePosDiscountControls(undefined)).toEqual(DEFAULT_POS_DISCOUNT_CONTROLS);
  });

  it("parses bootstrap discount_controls shape", () => {
    const n = normalizePosDiscountControls({
      manual_enabled: false,
      max_percent: 15,
      max_fixed_mvr: 50,
      effective_cap_percent: 15,
      reason_required: true,
      reasons: ["Loyal customer", "  ", "Staff meal"],
      approval_required: true,
    });
    expect(n.manual_enabled).toBe(false);
    expect(n.max_percent).toBe(15);
    expect(n.max_fixed_mvr).toBe(50);
    expect(n.reason_required).toBe(true);
    expect(n.approval_required).toBe(true);
    expect(n.reasons).toEqual(["Loyal customer", "Staff meal"]);
  });
});

describe("validateManualDiscountInput / computeEffectiveDiscountCapMvr", () => {
  const base = {
    ...DEFAULT_POS_DISCOUNT_CONTROLS,
    max_percent: 10,
    reason_required: true,
    reasons: ["Loyal customer", "Other (note required)"],
  };

  it("computes percent + fixed cap against subtotal", () => {
    // 10% of 200 = 20; fixed 15 → min is 15
    expect(
      computeEffectiveDiscountCapMvr(200, { ...base, max_fixed_mvr: 15 }),
    ).toBe(15);
    expect(computeEffectiveDiscountCapMvr(200, { ...base, max_fixed_mvr: 0 })).toBe(20);
  });

  it("rejects above-cap with server-style message", () => {
    const msg = validateManualDiscountInput({
      amountMvr: 25,
      subtotalMvr: 200,
      controls: base,
      reason: "Loyal customer",
    });
    expect(msg).toBe("Discount exceeds the maximum allowed (10%).");
  });

  it("requires a reason when configured", () => {
    expect(
      validateManualDiscountInput({
        amountMvr: 5,
        subtotalMvr: 200,
        controls: base,
        reason: null,
      }),
    ).toBe("A discount reason is required.");
  });

  it("requires a note for Other (note required)", () => {
    expect(
      validateManualDiscountInput({
        amountMvr: 5,
        subtotalMvr: 200,
        controls: base,
        reason: "Other (note required)",
        reasonNote: "  ",
      }),
    ).toBe("A note is required for this discount reason.");
  });

  it("accepts a valid within-cap discount with reason", () => {
    expect(
      validateManualDiscountInput({
        amountMvr: 10,
        subtotalMvr: 200,
        controls: base,
        reason: "Loyal customer",
      }),
    ).toBeNull();
  });
});
