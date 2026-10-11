import { useEffect, useMemo, useRef, useState } from "react";

import { trackPosSuggestion, type PosPairings } from "../api";
import { palette } from "../theme";
import type { CartItem, Item } from "../types";

type Props = {
  /** Whole menu for the current channel — ids resolve against this. */
  items: Item[];
  /** anchor item id -> suggested item ids, shipped inside the menu payload. */
  pairings: PosPairings;
  /** Item ids ranked by what sells at this hour, best first. */
  popularNow: number[];
  cartItems: CartItem[];
  /** Simple items add straight to the ticket. */
  addToCart: (item: Item) => void;
  /** Anything needing a variant / modifier / packaging choice opens configure. */
  handleSelectItem: (item: Item) => void;
  readOnly?: boolean;
  /** Dine-in never treats a packaging choice as a reason to configure. */
  packagingEligible?: boolean;
  maxChips?: number;
  /** How long a fresh set ignores taps, so a tap already on its way lands nowhere. */
  armMs?: number;
};

/**
 * A row above the menu that is always there (owner, 2026-10-11: "adding a
 * small stripe or row below or top of the items so its always there. Most
 * frequently items and when item is selected other items that comes usually
 * with that").
 *
 * It replaces the "Goes with" card that popped up over the ticket's footer,
 * where the next tap for the quantity or Charge kept landing on a suggestion
 * instead ("accidentally items are added without intention"). The row never
 * appears or moves: it shows what sells most at this hour, and after an item
 * is rung up, what usually goes with it. When its chips change they ignore
 * taps for a moment, so a tap meant for the old chip adds nothing.
 * Admin → Settings → Ordering turns it off.
 */
export function SuggestionStrip({
  items,
  pairings,
  popularNow,
  cartItems,
  addToCart,
  handleSelectItem,
  readOnly = false,
  packagingEligible = false,
  maxChips = 8,
  armMs = 600,
}: Props) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { mode, suggestions, anchorName } = useMemo(() => {
    const inCart = new Set(cartItems.map((line) => line.id));
    const sellable = (id: number) => {
      const item = byId.get(id);
      // A cached payload can be older than the menu it is drawn against.
      return item && item.is_available !== false ? item : null;
    };

    // The thing just rung up leads: its pairings, newest line first.
    const goes: Item[] = [];
    let anchor = "";
    const seen = new Set<number>();
    for (let i = cartItems.length - 1; i >= 0 && goes.length < maxChips; i -= 1) {
      for (const id of pairings[cartItems[i].id] ?? []) {
        if (inCart.has(id) || seen.has(id)) continue;
        const item = sellable(id);
        if (!item) continue;
        seen.add(id);
        goes.push(item);
        if (!anchor) anchor = cartItems[i].name;
        if (goes.length >= maxChips) break;
      }
    }
    if (goes.length > 0) return { mode: "goes" as const, suggestions: goes, anchorName: anchor };

    const popular = popularNow
      .filter((id) => !inCart.has(id))
      .map(sellable)
      .filter((i): i is Item => i !== null)
      .slice(0, maxChips);
    return { mode: "popular" as const, suggestions: popular, anchorName: "" };
  }, [cartItems, pairings, popularNow, byId, maxChips]);

  const signature = `${mode}:${suggestions.map((s) => s.id).join(",")}`;

  // Report a Goes-with set once; the row renders on every cart change.
  const shownSignature = useRef("");
  useEffect(() => {
    if (mode !== "goes" || shownSignature.current === signature) return;
    shownSignature.current = signature;
    trackPosSuggestion("shown", suggestions.map((s) => s.id));
  }, [mode, signature, suggestions]);

  // A changed set is not tappable straight away.
  const [armedSignature, setArmedSignature] = useState(signature);
  useEffect(() => {
    if (armMs <= 0) { setArmedSignature(signature); return; }
    const timer = window.setTimeout(() => setArmedSignature(signature), armMs);
    return () => window.clearTimeout(timer);
  }, [signature, armMs]);
  const armed = armedSignature === signature;

  return (
    <div
      data-testid="pos-suggestion-strip"
      data-mode={mode}
      aria-label={mode === "goes" ? `Goes with ${anchorName}` : "Popular now"}
      role="group"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 52,
        boxSizing: "border-box",
        padding: "6px 10px",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.panel,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          maxWidth: 130,
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: mode === "goes" ? palette.primaryDark : palette.panelMuted,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {mode === "goes" ? (
          <>
            Goes with
            <span style={{ display: "block", textTransform: "none", letterSpacing: 0, fontSize: 12, color: palette.panelInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {anchorName}
            </span>
          </>
        ) : "Popular now"}
      </span>

      <div
        className="pos-suggest-row"
        style={{
          display: "flex",
          gap: 6,
          flex: 1,
          minWidth: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
          opacity: armed ? 1 : 0.55,
          transition: "opacity 0.15s",
        }}
      >
        {suggestions.length === 0 && (
          <span style={{ fontSize: 12, color: palette.panelSubtle }}>
            {popularNow.length > 0
              ? "Everything popular is already on the ticket."
              : "The most sold items show here once there are sales."}
          </span>
        )}
        {suggestions.map((item) => {
          const needsConfigure =
            item.has_variants
            || (item.modifiers?.length ?? 0) > 0
            || (item.platter_groups?.length ?? 0) > 0
            || (packagingEligible && (item.packaging_options?.length ?? 0) > 1);
          const disabled = readOnly || !armed;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-label={`Add ${item.name}`}
              onClick={() => {
                if (disabled) return;
                // Same rule as the menu tiles, so a chip behaves like the item itself.
                if (needsConfigure) handleSelectItem(item);
                else addToCart(item);
                if (mode === "goes") trackPosSuggestion("accepted", [item.id]);
              }}
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 38,
                padding: "4px 12px",
                borderRadius: 10,
                border: `1px solid ${mode === "goes" ? palette.primaryLight : palette.border}`,
                background: mode === "goes" ? palette.primaryBg : palette.bg,
                color: palette.panelInk,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: "nowrap",
                cursor: disabled ? "default" : "pointer",
                opacity: readOnly ? 0.5 : 1,
              }}
            >
              <span>
                <span aria-hidden="true" style={{ color: palette.primary, marginRight: 4 }}>+</span>
                {item.name}
              </span>
              <span style={{ color: palette.panelMuted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {Number(item.base_price) > 0 ? Number(item.base_price).toFixed(2) : "free"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
