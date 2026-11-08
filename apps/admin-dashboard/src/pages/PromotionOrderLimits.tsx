import type { PromotionChannel, PromotionOrderType } from '../api';

/*
 * Which orders an offer is for (owner, 2026-11-08: "today all online orders will get 10% discount"
 * or "all dine in customers will get 100% discount on a dish"; "online mean order app"). Nothing
 * picked is every order; the server keeps the same rule (PromotionController, Promotion).
 */

export const CHANNEL_OPTIONS: { value: PromotionChannel; label: string }[] = [
  { value: 'till', label: 'At the counter (till)' },
  { value: 'online', label: 'Order app' },
];

export const ORDER_TYPE_OPTIONS: { value: PromotionOrderType; label: string }[] = [
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'online_pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

const TYPE_WORDS: Record<PromotionOrderType, string> = { dine_in: 'dine-in', takeaway: 'takeaway', online_pickup: 'pickup', delivery: 'delivery' };

/** Every option ticked is the same as none: every order. */
function limited<T extends string>(picked: T[] | null | undefined, all: { value: T }[]): T[] {
  const v = all.map((o) => o.value).filter((x) => (picked ?? []).includes(x));
  return v.length === all.length ? [] : v;
}

/** "Dine-in only", "App orders · pickup and delivery only", or null for every order. */
export function orderLimitText(channels?: PromotionChannel[] | null, types?: PromotionOrderType[] | null): string | null {
  const ch = limited(channels, CHANNEL_OPTIONS);
  const ty = limited(types, ORDER_TYPE_OPTIONS);
  const parts: string[] = [];
  if (ch.length) parts.push(ch[0] === 'online' ? 'App orders' : 'At the counter');
  if (ty.length) {
    const words = ty.map((t) => TYPE_WORDS[t]);
    parts.push(words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
  }
  if (!parts.length) return null;
  const text = `${parts.join(' · ')} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Chips<T extends string>({ options, picked, onChange, testId }: {
  options: { value: T; label: string }[];
  picked: T[];
  onChange: (next: T[]) => void;
  testId: string;
}) {
  return (
    <div role="group" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid={testId}>
      {options.map((o) => {
        const on = picked.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? picked.filter((v) => v !== o.value) : [...picked, o.value])}
            style={{
              minHeight: 32, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: on ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)',
              color: on ? 'var(--color-primary)' : 'var(--color-text-secondary)', fontWeight: 600, fontSize: 13,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function OrderLimitsField({ channels, types, onChange }: {
  channels: PromotionChannel[] | null | undefined;
  types: PromotionOrderType[] | null | undefined;
  onChange: (next: { order_channels: PromotionChannel[] | null; order_types: PromotionOrderType[] | null }) => void;
}) {
  const ch = channels ?? [];
  const ty = types ?? [];
  const label = orderLimitText(ch, ty);
  const emit = (c: PromotionChannel[], t: PromotionOrderType[]) => onChange({ order_channels: c.length ? c : null, order_types: t.length ? t : null });

  return (
    <div data-testid="promo-which-orders" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Which orders (optional — nothing picked = every order)</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Where ordered</span>
      <Chips options={CHANNEL_OPTIONS} picked={ch} onChange={(c) => emit(c, ty)} testId="promo-order-channels" />
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Order type</span>
      <Chips options={ORDER_TYPE_OPTIONS} picked={ty} onChange={(t) => emit(ch, t)} testId="promo-order-types" />
      <span data-testid="promo-which-orders-summary" style={{ fontSize: 12, color: label ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
        {label ?? 'Every order, at the till and in the order app.'}
      </span>
    </div>
  );
}
