/**
 * Apply cashier-staged rewards to a freshly created (or editable) order.
 * Rewards reconstructed from a resumed server ticket carry serverApplied
 * and must NOT be re-sent — they are already on the order.
 */

export type StagedRewardsInput = {
  appliedPromoCode: string | null;
  appliedLoyaltyPoints: number | null;
  appliedGiftCardCode: string | null;
  /** True when the reward was hydrated from the server order (resume). */
  appliedPromoServerApplied?: boolean;
  appliedLoyaltyServerApplied?: boolean;
  appliedGiftCardServerApplied?: boolean;
};

export type ApplyStagedRewardsApi = {
  applyPromoToOrder: (orderId: number, code: string) => Promise<unknown>;
  holdLoyaltyForOrder: (
    orderId: number,
    points: number,
  ) => Promise<{ order: { total: number } }>;
  applyGiftCardToOrder: (
    orderId: number,
    code: string,
  ) => Promise<{ order: { total: number } }>;
  removeGiftCardFromOrder: (orderId: number) => Promise<unknown>;
  getOrder: (orderId: number) => Promise<{ order: { total?: number } }>;
};

export type ApplyStagedRewardsResult = {
  total: number;
  failures: string[];
  /** True when at least one apply/remove API call was made. */
  didMutate: boolean;
};

export async function applyStagedRewards(
  orderId: number,
  currentTotal: number,
  staged: StagedRewardsInput,
  api: ApplyStagedRewardsApi,
  opts?: { resumedOrderId?: number | null },
): Promise<ApplyStagedRewardsResult> {
  let total = currentTotal;
  const failures: string[] = [];
  let didMutate = false;

  const promoCode = staged.appliedPromoServerApplied ? null : staged.appliedPromoCode;
  const loyaltyPoints = staged.appliedLoyaltyServerApplied
    ? null
    : staged.appliedLoyaltyPoints;
  const giftCardCode = staged.appliedGiftCardServerApplied
    ? null
    : staged.appliedGiftCardCode;

  if (promoCode) {
    try {
      await api.applyPromoToOrder(orderId, promoCode);
      didMutate = true;
    } catch (err) {
      failures.push(`promo "${promoCode}" (${(err as Error).message})`);
    }
  }

  if (loyaltyPoints && loyaltyPoints > 0) {
    try {
      const res = await api.holdLoyaltyForOrder(orderId, loyaltyPoints);
      total = res.order.total;
      didMutate = true;
    } catch (err) {
      failures.push(`loyalty redemption (${(err as Error).message})`);
    }
  }

  if (giftCardCode) {
    try {
      const res = await api.applyGiftCardToOrder(orderId, giftCardCode);
      total = res.order.total;
      didMutate = true;
    } catch (err) {
      failures.push(`gift card "${giftCardCode}" (${(err as Error).message})`);
    }
  } else if (
    opts?.resumedOrderId === orderId
    && !staged.appliedGiftCardServerApplied
    && !staged.appliedGiftCardCode
  ) {
    // Cashier cleared a staged gift card on a resumed ticket — drop soft hold.
    try {
      await api.removeGiftCardFromOrder(orderId);
      didMutate = true;
      const fresh = await api.getOrder(orderId);
      if (typeof fresh.order.total === "number") total = fresh.order.total;
    } catch {
      /* no gift card on order — fine */
    }
  }

  if (didMutate && (promoCode || (loyaltyPoints && loyaltyPoints > 0) || giftCardCode)) {
    try {
      const fresh = await api.getOrder(orderId);
      if (typeof fresh.order.total === "number") total = fresh.order.total;
    } catch {
      /* keep last-known total */
    }
  }

  return { total, failures, didMutate };
}
