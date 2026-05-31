export type DiscountParts = {
  promo?: number;
  loyalty?: number;
  manual?: number;
  gift_card?: number;
  referral?: number;
};

const DISCOUNT_KEYS = ['promo', 'loyalty', 'manual', 'gift_card', 'referral'] as const;

/** Mirror backend EffectiveDiscount::allocate — laar integers only. */
export function allocateDiscountLaar(subtotalLaar: number, parts: DiscountParts): Record<(typeof DISCOUNT_KEYS)[number], number> {
  const normalized: Record<(typeof DISCOUNT_KEYS)[number], number> = {
    promo: Math.max(0, parts.promo ?? 0),
    loyalty: Math.max(0, parts.loyalty ?? 0),
    manual: Math.max(0, parts.manual ?? 0),
    gift_card: Math.max(0, parts.gift_card ?? 0),
    referral: Math.max(0, parts.referral ?? 0),
  };

  if (subtotalLaar <= 0) {
    return Object.fromEntries(DISCOUNT_KEYS.map((k) => [k, 0])) as typeof normalized;
  }

  const rawSum = DISCOUNT_KEYS.reduce((sum, key) => sum + normalized[key], 0);
  if (rawSum <= 0) {
    return Object.fromEntries(DISCOUNT_KEYS.map((k) => [k, 0])) as typeof normalized;
  }

  if (rawSum <= subtotalLaar) {
    return normalized;
  }

  const scale = subtotalLaar / rawSum;
  const allocated = { ...normalized };
  let running = 0;
  const lastKey = DISCOUNT_KEYS[DISCOUNT_KEYS.length - 1];

  for (const key of DISCOUNT_KEYS) {
    if (key === lastKey) {
      allocated[key] = Math.max(0, subtotalLaar - running);
      continue;
    }
    const share = Math.floor(normalized[key] * scale);
    allocated[key] = share;
    running += share;
  }

  return allocated;
}

export function effectiveDiscountTotalLaar(subtotalLaar: number, parts: DiscountParts): number {
  const normalized = DISCOUNT_KEYS.reduce((sum, key) => sum + Math.max(0, parts[key] ?? 0), 0);
  return Math.min(subtotalLaar, Math.max(0, normalized));
}

export function discountedSubtotalLaar(subtotalLaar: number, parts: DiscountParts): number {
  return Math.max(0, subtotalLaar - effectiveDiscountTotalLaar(subtotalLaar, parts));
}
