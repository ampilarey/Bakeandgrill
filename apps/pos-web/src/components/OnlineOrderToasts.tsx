import type { IncomingOnlineOrder } from "../api";
import { posOrderTypeEmoji } from "../orderTypeLabels";

type Props = {
  toasts: IncomingOnlineOrder[];
  /** Called when the cashier dismisses a toast (X button or after the
   *  auto-dismiss timer expires). Tapping the toast body instead fires
   *  `onOpen` which navigates to the Receipts pane filtered to the
   *  new order — see `App.tsx` for how it's wired up. */
  onDismiss: (id: number) => void;
  /** Called when the cashier taps the toast itself — usually wired
   *  to swap the active pane to the online-orders view. Optional. */
  onOpen?: (id: number) => void;
};

const COLOR = {
  card: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  muted: "#64748B",
  primary: "#D4813A",
  accent: "#FEF3C7",
  accentBorder: "#FCD34D",
};

/**
 * Stacked floating toast in the bottom-right of the POS for incoming
 * online orders (pickup + delivery).
 * ringing in the cart while the toast sits in the corner. Tapping the
 * body opens the receipts pane filtered to this order; the X button
 * dismisses without navigating.
 *
 * Auto-dismiss timer (45s per toast) prevents a busy lunch rush from
 * burying the screen — if the cashier missed it, the Online Pickup
 * sidebar badge still shows the count.
 */
export function OnlineOrderToasts({ toasts, onDismiss, onOpen }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Incoming online orders"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 10,
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      {toasts.map((o) => (
        <ToastCard key={o.id} order={o} onDismiss={onDismiss} onOpen={onOpen} />
      ))}
    </div>
  );
}

function ToastCard({
  order,
  onDismiss,
  onOpen,
}: {
  order: IncomingOnlineOrder;
  onDismiss: (id: number) => void;
  onOpen?: (id: number) => void;
}) {
  return (
    <div
      style={{
        pointerEvents: "auto",
        minWidth: 280,
        maxWidth: 340,
        background: COLOR.card,
        border: `1px solid ${COLOR.accentBorder}`,
        borderLeft: `4px solid ${COLOR.primary}`,
        borderRadius: 10,
        padding: 12,
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)",
        animation: "pos-toast-in 200ms ease-out",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <button
          type="button"
          onClick={() => onOpen?.(order.id)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: onOpen ? "pointer" : "default",
            textAlign: "left",
            flex: 1,
          }}
        >
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLOR.primary,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 2,
          }}>
            {order.type === "delivery"
              ? `${posOrderTypeEmoji(order.type)} New delivery order`
              : order.type === "online_pickup"
                ? `${posOrderTypeEmoji(order.type)} New online takeaway`
                : "New online order"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.text, fontVariantNumeric: "tabular-nums" }}>
            {order.order_number}
          </div>
          <div style={{ fontSize: 12, color: COLOR.muted, marginTop: 4 }}>
            {order.customer_name ?? "Walk-in"}
            {order.customer_phone ? ` · ${order.customer_phone}` : ""}
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: COLOR.text,
            marginTop: 6,
            fontVariantNumeric: "tabular-nums",
          }}>
            MVR {Number(order.total).toFixed(2)}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onDismiss(order.id)}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            color: COLOR.muted,
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
