import { useEffect, useState, type ReactNode } from "react";
import { palette } from "../theme";

type Props = {
  /** What is on the ticket right now, one phrase each; empty means nothing. */
  summary: string[];
  /** Open the drawer whether the cashier asked or not — a field has an error to show. */
  forceOpen?: boolean;
  /** Changes when something was applied from outside (a scan); the drawer opens to show it. */
  openSignal?: number;
  children: ReactNode;
};

/**
 * "Discounts & rewards": the manual discount, promo code, loyalty points
 * and gift card behind one bar just above the totals.
 *
 * Owner, 2026-09-02: "discounts is above save ticket and active orders. To
 * save more space how about combining with gift card part." The discount
 * block was ~110px on every ticket whether or not a discount was given, and
 * the rewards drawer sat above the lines, pushing them down. Now both live
 * here, closed, as one 44px bar that says what is applied. Open it to
 * change any of them; it takes effect the moment it is applied, and the
 * totals rows above Charge show every line either way.
 */
export function TicketAdjustments({ summary, forceOpen = false, openSignal = 0, children }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  const applied = summary.length > 0;

  return (
    <div
      data-testid="ticket-adjustments"
      style={{
        border: `1px solid ${applied ? palette.primaryLight : palette.border}`,
        borderRadius: 10, background: palette.panel, overflow: "hidden", marginBottom: 8,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="ticket-adjustments-toggle"
        style={{
          width: "100%", minHeight: 44, padding: "6px 12px", border: "none", cursor: "pointer",
          background: open ? palette.bg : applied ? palette.primaryBg : palette.panel,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          fontFamily: "inherit", textAlign: "left", color: palette.panelInk,
        }}
      >
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: applied ? palette.primaryDark : palette.panelMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Discounts & rewards
          </span>
          <span
            data-testid="ticket-adjustments-summary"
            style={{ fontSize: 12, fontWeight: 600, color: applied ? palette.panelInk : palette.panelMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {applied ? summary.join(" · ") : "None — tap to add"}
          </span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 14, color: palette.panelMuted, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div data-testid="ticket-adjustments-body" style={{ padding: "4px 12px 12px", borderTop: `1px solid ${palette.border}` }}>
          {children}
        </div>
      )}
    </div>
  );
}
