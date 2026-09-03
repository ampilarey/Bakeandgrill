import type { ReactNode } from "react";
import { Overlay } from "./OpenShiftModal";
import { palette, z } from "../theme";

type Props = {
  /** What is on the ticket right now, one phrase each; empty means nothing. */
  summary: string[];
  onClose: () => void;
  children: ReactNode;
};

/**
 * "Discounts & rewards" as a dialog: the manual discount, promo code,
 * loyalty points and gift card, on a screen of their own.
 *
 * Owner, 2026-09-03: "discount page is now available when clicked only. So
 * no need to keep too small. Can appear as pop up also."
 *
 * It used to be a drawer inside the cart footer, which on a phone or an iPad
 * in portrait is height-capped — so the fields fought the cart lines for
 * room and pushed Charge down the screen. Opened deliberately from the
 * header button, it has no reason to be cramped: here it gets the width and
 * the height, and the numbers are entered on a pad rather than a 6px-padded
 * input.
 *
 * Everything inside applies the moment it is applied, exactly as it did in
 * the drawer, so "Done" only closes the dialog — there is nothing to save.
 * It sits on `z.cartModal`, below the scanner, so scanning a gift card from
 * inside it puts the camera on top rather than behind.
 *
 * Owner, 2026-09-03: "when numbers are entered, size changes. And when gift
 * code is clicked the popup screen [gets] v bigger." On a phone the dialog
 * is a fixed-height sheet (see `.pos-discounts-modal` in index.css) and only
 * this body scrolls, so typing a digit or opening the gift-card fields moves
 * what is inside it and never the dialog itself — the keypad above stays
 * exactly where the thumb left it.
 */
export function DiscountsModal({ summary, onClose, children }: Props) {
  const applied = summary.length > 0;

  return (
    <Overlay onEscape={onClose} zIndex={z.cartModal}>
      <div
        className="pos-discounts-modal"
        data-testid="discounts-modal"
        style={{
          background: palette.panel, borderRadius: 16,
          width: "100%", maxWidth: 460,
          maxHeight: "min(92dvh, 860px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          margin: "auto", overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 8, padding: "14px 16px", borderBottom: `1px solid ${palette.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, color: palette.panelInk }}>Discounts &amp; rewards</h2>
            <div
              data-testid="discounts-modal-summary"
              style={{
                marginTop: 2, fontSize: 12, fontWeight: 600,
                color: applied ? palette.primaryDark : palette.panelMuted,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {applied ? summary.join(" · ") : "Nothing applied yet"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close discounts and rewards"
            style={{
              flexShrink: 0, minWidth: 44, minHeight: 44, border: "none",
              background: "transparent", fontSize: 20, cursor: "pointer",
              color: palette.panelMuted,
            }}
          >
            ✕
          </button>
        </div>

        <div
          data-testid="discounts-modal-body"
          style={{
            padding: "4px 16px 16px",
            flex: "1 1 auto", minHeight: 0,
            overflowY: "auto", WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>

        <div style={{ padding: 12, borderTop: `1px solid ${palette.border}`, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%", minHeight: 48, borderRadius: 10, border: "none",
              background: palette.primary, color: "#fff",
              fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </Overlay>
  );
}
