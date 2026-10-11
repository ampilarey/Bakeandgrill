import type { CSSProperties } from "react";
import { orderTypeTone, posOrderTypeEmoji, posOrderTypeLabel } from "../orderTypeLabels";

/**
 * The order's type as a solid chip in its own colour, with its icon and word
 * (owner, 2026-10-11: "add more visual colors to differentiate between order
 * type in pos"). Solid, where the stage and payment badges beside it are
 * light, so the type is the first thing read on a card.
 */
export function OrderTypeChip({
  type,
  staffUserId,
  isCustomerPlaced,
  size = "sm",
  style,
}: {
  type: string | null | undefined;
  staffUserId?: number | null;
  isCustomerPlaced?: boolean | null;
  size?: "sm" | "md";
  style?: CSSProperties;
}) {
  const label = posOrderTypeLabel(type, staffUserId, isCustomerPlaced);
  if (!label) return null;
  const tone = orderTypeTone(type);
  return (
    <span
      data-testid="order-type-chip"
      data-order-type={tone.key}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: size === "md" ? 12 : 11,
        fontWeight: 800,
        letterSpacing: 0.3,
        padding: size === "md" ? "3px 9px" : "2px 7px",
        borderRadius: 6,
        border: `1px solid ${tone.solid}`,
        background: tone.solid,
        color: "#fff",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true">{posOrderTypeEmoji(type, staffUserId, isCustomerPlaced)}</span>
      {label}
    </span>
  );
}
