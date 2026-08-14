import { describe, it, expect } from "vitest";

/**
 * Mirrors chargeTotal's pending-payment branch in usePosApp.
 * A stuck 0.00 failed-settle snapshot must not hide the live cart total.
 */
function resolveChargeTotal(args: {
  pendingPaymentForOrderId: number | null;
  pendingPaymentTotalDue: number | null;
  cartTotal: number;
}): number {
  if (
    args.pendingPaymentForOrderId != null
    && args.pendingPaymentTotalDue != null
    && args.pendingPaymentTotalDue > 0
  ) {
    return args.pendingPaymentTotalDue;
  }
  return args.cartTotal;
}

describe("POS chargeTotal pending-payment pin", () => {
  it("uses pending due when retrying a real outstanding balance", () => {
    expect(resolveChargeTotal({
      pendingPaymentForOrderId: 2,
      pendingPaymentTotalDue: 85.5,
      cartTotal: 120,
    })).toBe(85.5);
  });

  it("falls through to live cart when pending due is stuck at 0", () => {
    expect(resolveChargeTotal({
      pendingPaymentForOrderId: 2,
      pendingPaymentTotalDue: 0,
      cartTotal: 45,
    })).toBe(45);
  });

  it("uses live cart when there is no pending payment", () => {
    expect(resolveChargeTotal({
      pendingPaymentForOrderId: null,
      pendingPaymentTotalDue: null,
      cartTotal: 30,
    })).toBe(30);
  });
});
