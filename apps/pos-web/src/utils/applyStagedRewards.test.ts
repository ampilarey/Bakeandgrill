import { describe, expect, it, vi } from "vitest";
import { applyStagedRewards } from "./applyStagedRewards";

describe("applyStagedRewards", () => {
  it("skips serverApplied rewards and does not re-apply them", async () => {
    const api = {
      applyPromoToOrder: vi.fn(),
      holdLoyaltyForOrder: vi.fn(),
      applyGiftCardToOrder: vi.fn(),
      removeGiftCardFromOrder: vi.fn(),
      getOrder: vi.fn().mockResolvedValue({
        order: { total: 108, gift_card_discount_laar: 4000 },
      }),
    };

    const result = await applyStagedRewards(
      42,
      100,
      {
        appliedPromoCode: "applied",
        appliedLoyaltyPoints: 1,
        appliedGiftCardCode: "****1234",
        appliedPromoServerApplied: true,
        appliedLoyaltyServerApplied: true,
        appliedGiftCardServerApplied: true,
      },
      api,
      { resumedOrderId: 42 },
    );

    // May GET order to compute amount due (grand − gift tender); never re-apply.
    expect(result.total).toBe(68);
    expect(result.failures).toEqual([]);
    expect(result.didMutate).toBe(false);
    expect(api.applyPromoToOrder).not.toHaveBeenCalled();
    expect(api.holdLoyaltyForOrder).not.toHaveBeenCalled();
    expect(api.applyGiftCardToOrder).not.toHaveBeenCalled();
    expect(api.removeGiftCardFromOrder).not.toHaveBeenCalled();
  });

  it("applies freshly staged rewards when serverApplied is false", async () => {
    const api = {
      applyPromoToOrder: vi.fn().mockResolvedValue({}),
      holdLoyaltyForOrder: vi.fn().mockResolvedValue({ order: { total: 90 } }),
      applyGiftCardToOrder: vi.fn().mockResolvedValue({ order: { total: 80 } }),
      removeGiftCardFromOrder: vi.fn(),
      getOrder: vi.fn().mockResolvedValue({ order: { total: 80 } }),
    };

    const result = await applyStagedRewards(
      7,
      100,
      {
        appliedPromoCode: "SAVE10",
        appliedLoyaltyPoints: 500,
        appliedGiftCardCode: "GC-REAL",
        appliedPromoServerApplied: false,
        appliedLoyaltyServerApplied: false,
        appliedGiftCardServerApplied: false,
      },
      api,
    );

    expect(api.applyPromoToOrder).toHaveBeenCalledWith(7, "SAVE10");
    expect(api.holdLoyaltyForOrder).toHaveBeenCalledWith(7, 500);
    expect(api.applyGiftCardToOrder).toHaveBeenCalledWith(7, "GC-REAL");
    expect(result.total).toBe(80);
    expect(result.failures).toEqual([]);
  });

  it("does not remove gift card on resume when serverApplied gift card is present", async () => {
    const api = {
      applyPromoToOrder: vi.fn(),
      holdLoyaltyForOrder: vi.fn(),
      applyGiftCardToOrder: vi.fn(),
      removeGiftCardFromOrder: vi.fn(),
      getOrder: vi.fn(),
    };

    await applyStagedRewards(
      42,
      50,
      {
        appliedPromoCode: null,
        appliedLoyaltyPoints: null,
        appliedGiftCardCode: "****9999",
        appliedGiftCardServerApplied: true,
      },
      api,
      { resumedOrderId: 42 },
    );

    expect(api.removeGiftCardFromOrder).not.toHaveBeenCalled();
    expect(api.applyGiftCardToOrder).not.toHaveBeenCalled();
  });
});
