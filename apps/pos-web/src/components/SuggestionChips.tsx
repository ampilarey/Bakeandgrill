import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { trackPosSuggestion, type PosPairings } from "../api";
import { palette, z } from "../theme";
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
  /** How long a fresh set stays up before it slides away on its own. */
  autoHideMs?: number;
};

/** Where the card sits: just above the cart's footer, or above the docked bar on a phone. */
type Anchor = { left: number; width: number; bottom: number };

/** The element the card sits above, when one is on screen. */
function anchorElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const visible = (el: Element | null): el is HTMLElement =>
    el instanceof HTMLElement && el.getClientRects().length > 0;

  // The footer is hidden while the phone cart is docked; the dock bar is
  // hidden once it is open as a sheet. Whichever is on screen is the anchor.
  const footer = document.querySelector(".pos-cart-footer");
  const dock = document.querySelector(".pos-cart-dock-bar");
  return visible(footer) ? footer : visible(dock) ? dock : null;
}

function measureAnchor(target: HTMLElement | null): Anchor | null {
  if (!target || typeof window === "undefined") return null;
  const rect = target.getBoundingClientRect();
  if (rect.width === 0) return null;

  return {
    left: rect.left,
    width: rect.width,
    bottom: Math.max(0, window.innerHeight - rect.top) + 8,
  };
}

/**
 * "Goes with" — a small card that pops up over the ticket when the last
 * thing rung up has a pairing.
 *
 * It used to be a row of chips laid out as a sibling of the cart, which on a
 * wide till made it a third column: two lonely pills floating in the empty
 * space left of the ticket. Owner, 2026-09-02: "goes with should be a popup
 * msg". So it is now a card pinned just above the Charge area (or above the
 * docked bar on a phone), named after the item it is pairing with, that
 * slides away on its own after a few seconds or when the cashier taps ✕.
 *
 * It still costs the cashier nothing: it never blocks the ticket or the
 * menu, a chip adds in one tap, and it never comes back for the same set
 * once dismissed. The pairings arrive inside the menu payload and are cached
 * with it, so this keeps working when the connection drops.
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
  autoHideMs = 12000,
}: Props) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { suggestions, anchorName } = useMemo(() => {
    if (cartItems.length === 0) return { suggestions: [] as Item[], anchorName: "" };

    const inCart = new Set(cartItems.map((line) => line.id));
    const seen = new Set<number>();
    const out: Item[] = [];
    let anchor = "";

    // Walk the ticket newest-first: the thing just rung up is what the cashier
    // is talking about, so its pairings should lead — and name the card.
    for (let i = cartItems.length - 1; i >= 0; i -= 1) {
      for (const suggestedId of pairings[cartItems[i].id] ?? []) {
        if (inCart.has(suggestedId) || seen.has(suggestedId)) continue;
        const item = byId.get(suggestedId);
        // The server filters to sellable items, but a cached payload can be
        // older than the menu it is drawn against.
        if (!item || item.is_available === false) continue;
        seen.add(suggestedId);
        out.push(item);
        if (!anchor) anchor = cartItems[i].name;
        if (out.length >= maxChips) return { suggestions: out, anchorName: anchor };
      }
    }

    return { suggestions: out, anchorName: anchor };
  }, [cartItems, pairings, byId, maxChips]);

  const signature = suggestions.map((s) => s.id).join(",");

  // Report a set once. This renders on every cart change, and counting the
  // same chips repeatedly would quietly destroy the take rate in the admin
  // report — the whole reason the tracking exists.
  const shownSignature = useRef("");
  useEffect(() => {
    if (!signature || shownSignature.current === signature) return;
    shownSignature.current = signature;
    trackPosSuggestion("shown", suggestions.map((s) => s.id));
  }, [signature, suggestions]);

  // A set the cashier closed, or that timed out, stays closed. A new set —
  // another item rung up — opens the card again.
  const [hiddenSignature, setHiddenSignature] = useState("");
  const open = signature !== "" && hiddenSignature !== signature;

  useEffect(() => {
    if (!open || autoHideMs <= 0) return;
    const timer = window.setTimeout(() => setHiddenSignature(signature), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [open, signature, autoHideMs]);

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const target = anchorElement();
    const place = () => setAnchor(measureAnchor(target));
    place();
    window.addEventListener("resize", place);
    // The footer grows when a discount or fee line lands; follow it, or the
    // card ends up over the Charge button until the next item is rung up.
    const ro = typeof ResizeObserver !== "undefined" && target ? new ResizeObserver(place) : null;
    ro?.observe(target!);
    return () => {
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, [open, signature, cartItems.length]);

  if (!open) return null;

  const placement: React.CSSProperties = anchor
    ? { left: anchor.left, width: anchor.width, bottom: anchor.bottom }
    : { left: 16, right: 16, bottom: 16 };

  return (
    <div
      data-testid="pos-suggestion-chips"
      role="status"
      aria-label={`Goes with ${anchorName}`}
      className="pos-suggest"
      style={{
        position: "fixed",
        // Below the modal layer: a size or modifier dialog must never have
        // this card sitting on top of it.
        zIndex: z.banner,
        boxSizing: "border-box",
        padding: "10px 12px 12px",
        borderRadius: 12,
        border: `1px solid ${palette.primaryLight}`,
        borderLeft: `4px solid ${palette.primary}`,
        background: palette.panel,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.18)",
        ...placement,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, paddingRight: 36, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: palette.primaryDark, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Goes with
        </span>
        <span
          style={{
            fontSize: 14, fontWeight: 700, color: palette.panelInk,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
          }}
        >
          {anchorName}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                flex: "1 1 auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                minHeight: 44,
                padding: "6px 12px 6px 14px",
                borderRadius: 10,
                border: `1px solid ${palette.border}`,
                background: palette.bg,
                color: palette.panelInk,
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 700,
                textAlign: "left",
                cursor: readOnly ? "not-allowed" : "pointer",
                opacity: readOnly ? 0.5 : 1,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ color: palette.primary, marginRight: 6 }}>+</span>
                {item.name}
              </span>
              <span style={{ color: palette.panelMuted, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {Number(item.base_price) > 0 ? Number(item.base_price).toFixed(2) : "free"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Last in the DOM so the chips keep their order for a screen reader;
          drawn in the corner. */}
      <button
        type="button"
        onClick={() => setHiddenSignature(signature)}
        aria-label="Hide suggestions"
        style={{
          position: "absolute", top: 6, right: 6,
          width: 32, height: 32, borderRadius: 8,
          border: "none", background: "transparent",
          color: palette.panelMuted, fontSize: 16, lineHeight: 1, cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>
  );
}
