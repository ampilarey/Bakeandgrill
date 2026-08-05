import { useEffect, useRef, useState } from 'react';
import { fetchCartRewards, type CartRewardChoice } from '../api/promotions';
import type { Item } from '../api';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * First cart-level offer surface. NOT the platter picker — one list, pick one, free.
 * Non-blocking: declining always allowed; checkout never waits on this.
 */
export function CartRewardPrompt() {
  const { cart, addItem, removeRewardClaims } = useCart();
  const { t } = useLanguage();
  const [offers, setOffers] = useState<CartRewardChoice[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [withdrawnMsg, setWithdrawnMsg] = useState<string | null>(null);
  const claimedPromoIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    claimedPromoIds.current = new Set(
      cart.map((e) => e.rewardPromotionId).filter((id): id is number => id != null),
    );
  }, [cart]);

  useEffect(() => {
    if (cart.length === 0) {
      setOffers([]);
      setWithdrawnMsg(null);
      return;
    }

    let cancelled = false;
    const items = cart
      .filter((e) => !e.rewardPromotionId)
      .map((e) => ({
        item_id: e.item.id,
        quantity: e.quantity,
        unit_price: Number(e.variantPrice ?? e.item.base_price) || 0,
      }));

    if (items.length === 0) {
      setOffers([]);
      const claimed = [...claimedPromoIds.current];
      if (claimed.length > 0) {
        removeRewardClaims(claimed);
        setWithdrawnMsg(t('cart.reward_withdrawn'));
      }
      return;
    }

    fetchCartRewards(items)
      .then((res) => {
        if (cancelled) return;
        const next = res.rewards ?? [];
        setOffers(next);

        // If a claimed free reward is no longer earned, withdraw it and tell the customer.
        const earnedIds = new Set(next.map((r) => r.promotion_id));
        const stale = [...claimedPromoIds.current].filter((id) => !earnedIds.has(id));
        if (stale.length > 0) {
          removeRewardClaims(stale);
          setWithdrawnMsg(t('cart.reward_withdrawn'));
        }
      })
      .catch(() => {
        if (!cancelled) setOffers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [cart, removeRewardClaims, t]);

  const visible = offers.filter(
    (o) => !dismissed.has(o.promotion_id) && !claimedPromoIds.current.has(o.promotion_id),
  );

  const pick = (offer: CartRewardChoice, reward: CartRewardChoice['reward_items'][number]) => {
    const item = {
      id: reward.id,
      name: reward.name,
      base_price: reward.base_price,
      image_url: reward.image_url,
      is_available: reward.is_available !== false,
      is_active: true,
      category_id: 0,
      has_variants: false,
      modifiers: [],
    } as Item;
    addItem(item, 1, [], null, null, { rewardPromotionId: offer.promotion_id });
    setWithdrawnMsg(null);
  };

  if (withdrawnMsg) {
    return (
      <div
        data-testid="cart-reward-withdrawn"
        role="status"
        style={{
          padding: '0.75rem 1rem',
          borderRadius: 12,
          background: 'var(--color-warning-bg, #fff7ed)',
          border: '1px solid var(--color-border)',
          fontSize: 13,
          color: 'var(--color-text)',
        }}
      >
        {withdrawnMsg}
        <button
          type="button"
          onClick={() => setWithdrawnMsg(null)}
          style={{ marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}
        >
          OK
        </button>
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div data-testid="cart-reward-prompt" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {visible.map((offer) => (
        <div
          key={offer.promotion_id}
          style={{
            padding: '0.9rem 1rem',
            borderRadius: 14,
            border: '1px solid var(--color-primary)',
            background: 'var(--color-surface)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            {offer.message || t('cart.reward_earned')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {offer.reward_items.filter((r) => r.is_available !== false).map((reward) => (
              <button
                key={reward.id}
                type="button"
                data-testid={`cart-reward-pick-${reward.id}`}
                onClick={() => pick(offer, reward)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: 44,
                  padding: '0.5rem 0.75rem',
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                }}
              >
                <span>{reward.name}</span>
                <span style={{ color: 'var(--color-primary)', fontSize: 12 }}>{t('cart.reward_free')}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid={`cart-reward-decline-${offer.promotion_id}`}
            onClick={() => setDismissed((prev) => new Set(prev).add(offer.promotion_id))}
            style={{
              marginTop: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              textDecoration: 'underline',
            }}
          >
            {t('cart.reward_declined')}
          </button>
        </div>
      ))}
    </div>
  );
}
