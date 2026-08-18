import { useEffect, useMemo, useRef } from "react";

import { trackPosSuggestion, type PosPairings } from "../api";
import { palette } from "../theme";
import type { CartItem, Item } from "../types";

type Props = {
  /** Whole menu for the current channel — chips resolve ids against this. */
  items: Item[];
  /** anchor item id -> suggested item ids, shipped inside the menu payload. */
  pairings: PosPairings;
  cartItems: CartItem[];
  /** Simple items add straight to the ticket. */
  addToCart: (item: Item) => void;
  /** Anything needing a variant / modifier / packaging choice opens configure. */
  handleSelectItem: (item: Item) => void;
  readOnly?: boolean;
  /** Dine-in never treats a packaging choice as a reason to configure. */
  packagingEligible?: boolean;
  maxChips?: number;
};

/**
 * "Goes well with" chips above the ticket.
 *
 * The till is the one place a human is actually talking to the customer, so a
 * prompt here converts far better than a panel on a phone — but only if it
 * costs the cashier nothing. Hence chips rather than a modal: they sit in the
 * flow, they add in one tap, and they never block the queue.
 *
 * The pairings arrive inside the menu payload and are cached with it, so this
 * keeps working when the connection drops.
 */
export function SuggestionChips({
  items,
  pairings,
  cartItems,
  addToCart,
  handleSelectItem,
  readOnly = false,
  packagingEligible = false,
  maxChips = 3,
}: Props) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const suggestions = useMemo(() => {
    if (cartItems.length === 0) return [];

    const inCart = new Set(cartItems.map((line) => line.id));
    const seen = new Set<number>();
    const out: Item[] = [];

    // Walk the ticket newest-first: the thing just rung up is what the cashier
    // is talking about, so its pairings should lead.
    for (let i = cartItems.length - 1; i >= 0; i -= 1) {
      for (const suggestedId of pairings[cartItems[i].id] ?? []) {
        if (inCart.has(suggestedId) || seen.has(suggestedId)) continue;
        const item = byId.get(suggestedId);
        // The server filters to sellable items, but a cached payload can be
        // older than the menu it is drawn against.
        if (!item || item.is_available === false) continue;
        seen.add(suggestedId);
        out.push(item);
        if (out.length >= maxChips) return out;
      }
    }

    return out;
  }, [cartItems, pairings, byId, maxChips]);

  // Report a set once. This renders on every cart change, and counting the
  // same chips repeatedly would quietly destroy the take rate in the admin
  // report — the whole reason the tracking exists.
  const shownSignature = useRef("");
  useEffect(() => {
    const signature = suggestions.map((s) => s.id).join(",");
    if (!signature || shownSignature.current === signature) return;
    shownSignature.current = signature;
    trackPosSuggestion("shown", suggestions.map((s) => s.id));
  }, [suggestions]);

  if (suggestions.length === 0) return null;

  return (
    <div
      data-testid="pos-suggestion-chips"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "8px 10px",
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: palette.panelMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Goes with
      </span>
      {suggestions.map((item) => {
        const needsConfigure =
          item.has_variants
          || (item.modifiers?.length ?? 0) > 0
          || (packagingEligible && (item.packaging_options?.length ?? 0) > 1);

        return (
          <button
            key={item.id}
            type="button"
            disabled={readOnly}
            aria-label={`Add ${item.name}`}
            onClick={() => {
              if (readOnly) return;
              // Same rule the menu tiles use, so a chip behaves exactly like
              // tapping the item itself — no surprise second flow.
              if (needsConfigure) handleSelectItem(item);
              else addToCart(item);
              trackPosSuggestion("accepted", [item.id]);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${palette.border}`,
              background: palette.panel,
              color: palette.panelInk,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              cursor: readOnly ? "not-allowed" : "pointer",
              opacity: readOnly ? 0.5 : 1,
              // Comfortable for a thumb at a counter without stealing a row
              // from the ticket.
              minHeight: 36,
            }}
          >
            <span>{item.name}</span>
            <span style={{ color: palette.panelMuted, fontWeight: 500 }}>
              +{Number(item.base_price).toFixed(2)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
