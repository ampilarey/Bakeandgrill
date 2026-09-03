import { useEffect, useState } from "react";

/**
 * Config-driven manual discount input + optional reason chips.
 * Extracted from OrderCart for focused vitest coverage.
 *
 * Owner, 2026-09-02: "there is only amount input, not a %". The field now
 * takes either. In % mode the cashier types a percentage (or taps a chip)
 * and the field works out the MVR against the cart subtotal, re-doing the
 * sum whenever the cart changes so 10% stays 10%. The server only ever sees
 * an amount in MVR, exactly as before; the percentage is a way of typing it.
 */
type Mode = "mvr" | "pct";

const PERCENT_CHIPS = [5, 10, 15, 20, 25, 50];

function mvrForPercent(subtotal: number, pct: number): string {
  if (!(subtotal > 0) || !(pct > 0)) return "";
  return (Math.round(subtotal * pct) / 100).toFixed(2);
}
export type ManualDiscountControlsConfig = {
  manual_enabled: boolean;
  max_percent: number;
  max_fixed_mvr: number;
  reason_required: boolean;
  reasons: string[];
  approval_required?: boolean;
  can_self_approve?: boolean;
};

type Props = {
  discountAmount: string;
  setDiscountAmount: (v: string) => void;
  discountReason?: string | null;
  setDiscountReason?: (v: string | null) => void;
  discountReasonNote?: string;
  setDiscountReasonNote?: (v: string) => void;
  discountControls: ManualDiscountControlsConfig;
  discountFieldError?: string;
  /** Cart subtotal in MVR; what a percentage is taken of. */
  subtotal?: number;
  disabled?: boolean;
  mutedColor?: string;
  borderColor?: string;
  textColor?: string;
};

export function ManualDiscountField({
  discountAmount,
  setDiscountAmount,
  discountReason,
  setDiscountReason,
  discountReasonNote,
  setDiscountReasonNote,
  discountControls,
  discountFieldError,
  subtotal = 0,
  disabled = false,
  mutedColor = "#64748B",
  borderColor = "#CBD5E1",
  textColor = "#0F172A",
}: Props) {
  const [mode, setMode] = useState<Mode>("mvr");
  const [pctText, setPctText] = useState("");
  const pct = Number.parseFloat(pctText) || 0;

  // In % mode the amount follows the cart: add or remove a line and the
  // MVR is worked out again from the same percentage.
  useEffect(() => {
    if (mode !== "pct") return;
    const next = mvrForPercent(subtotal, pct);
    if (next !== discountAmount) setDiscountAmount(next);
    // discountAmount is what this effect writes; reacting to it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pct, subtotal]);

  if (!discountControls.manual_enabled) return null;

  const maxPct = discountControls.max_percent ?? 100;
  const maxFixed = discountControls.max_fixed_mvr ?? 0;
  const capParts: string[] = [];
  if (maxPct < 100) capParts.push(`max ${maxPct}%`);
  if (maxFixed > 0) capParts.push(`max MVR ${maxFixed.toFixed(2)}`);

  const amountMvr = Number.parseFloat(discountAmount) || 0;
  const amountEntered = amountMvr > 0;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "pct") {
      // Carry the amount across as the percentage it already is.
      setPctText(subtotal > 0 && amountMvr > 0 ? String(Math.round((amountMvr / subtotal) * 1000) / 10) : "");
    }
    setMode(next);
  };
  const pickChip = (value: number) => {
    if (mode === "pct" && pct === value) {
      setPctText("");
      return;
    }
    setMode("pct");
    setPctText(String(value));
  };

  const equivalent = mode === "pct"
    ? (pct > 0 && subtotal > 0 ? `= MVR ${mvrForPercent(subtotal, pct) || "0.00"}` : subtotal > 0 ? "" : "Add items first")
    : (amountEntered && subtotal > 0 ? `= ${(Math.round((amountMvr / subtotal) * 1000) / 10).toFixed(1)}% of MVR ${subtotal.toFixed(2)}` : "");
  const showReasons = discountControls.reason_required && amountEntered;
  // Say so before Charge, not after: a cashier who types a discount is about
  // to be asked for a manager's code.
  const needsCode =
    amountEntered && discountControls.approval_required !== false && !discountControls.can_self_approve;

  return (
    <div style={{ marginTop: 8 }} data-testid="manual-discount-field">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: mutedColor, fontWeight: 600 }}>
          Discount
          {capParts.length > 0 && (
            <span style={{ fontWeight: 500, color: mutedColor, marginLeft: 4 }}>
              ({capParts.join(", ")})
            </span>
          )}
        </label>
        <div
          role="group"
          aria-label="Discount as"
          style={{ display: "inline-flex", borderRadius: 6, border: `1px solid ${borderColor}`, overflow: "hidden", flexShrink: 0 }}
        >
          {(["mvr", "pct"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={disabled}
              onClick={() => switchMode(m)}
              style={{
                minHeight: 30, padding: "0 10px", border: "none", fontFamily: "inherit",
                fontSize: 12, fontWeight: 700, cursor: disabled ? "default" : "pointer",
                background: mode === m ? "#D4813A" : "#fff",
                color: mode === m ? "#fff" : textColor,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {m === "mvr" ? "MVR" : "%"}
            </button>
          ))}
        </div>
        {mode === "pct" ? (
          <input
            value={pctText}
            onChange={(e) => setPctText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            aria-label="Discount percent"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${discountFieldError ? "#FCA5A5" : borderColor}`,
              fontSize: 13,
              textAlign: "right",
              opacity: disabled ? 0.5 : 1,
            }}
          />
        ) : (
          <input
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            aria-label="Discount amount"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${discountFieldError ? "#FCA5A5" : borderColor}`,
              fontSize: 13,
              textAlign: "right",
              opacity: disabled ? 0.5 : 1,
            }}
          />
        )}
      </div>
      {/* The other way of saying the same number, so a cashier who typed
          15% sees MVR 22.50 go on the ticket, and one who typed MVR 20
          sees it is 13.3%. */}
      {equivalent && (
        <div data-testid="discount-equivalent" style={{ marginTop: 4, fontSize: 11, color: mutedColor, textAlign: "right" }}>
          {equivalent}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }} data-testid="discount-percent-chips">
        {PERCENT_CHIPS.filter((v) => v <= maxPct).map((v) => {
          const on = mode === "pct" && pct === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => pickChip(v)}
              style={{
                minHeight: 30, padding: "0 10px", borderRadius: 999,
                border: `1px solid ${on ? "#D4813A" : borderColor}`,
                background: on ? "#FEF3E8" : "#fff",
                color: on ? "#B86820" : textColor,
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {v}%
            </button>
          );
        })}
      </div>
      {discountFieldError && (
        <div role="alert" style={{ marginTop: 4, fontSize: 11, color: "#B91C1C" }}>
          {discountFieldError}
        </div>
      )}
      {needsCode && !discountFieldError && (
        <div data-testid="discount-needs-code" style={{ marginTop: 4, fontSize: 11, color: mutedColor }}>
          A manager's code is needed to apply this. You will be asked for it at Charge.
        </div>
      )}
      {showReasons && (
        <div style={{ marginTop: 8 }} data-testid="discount-reason-picker">
          <div style={{ fontSize: 11, color: mutedColor, fontWeight: 600, marginBottom: 6 }}>
            Discount reason
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(discountControls.reasons ?? []).map((reason) => {
              const selected = discountReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  disabled={disabled}
                  onClick={() => setDiscountReason?.(selected ? null : reason)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: `1px solid ${selected ? "#D4813A" : borderColor}`,
                    background: selected ? "#FEF3E8" : "#fff",
                    color: selected ? "#B86820" : textColor,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {reason}
                </button>
              );
            })}
          </div>
          <input
            value={discountReasonNote ?? ""}
            onChange={(e) => setDiscountReasonNote?.(e.target.value)}
            placeholder="Optional note"
            disabled={disabled}
            aria-label="Discount reason note"
            style={{
              marginTop: 6,
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${borderColor}`,
              fontSize: 12,
              opacity: disabled ? 0.5 : 1,
            }}
          />
        </div>
      )}
    </div>
  );
}
