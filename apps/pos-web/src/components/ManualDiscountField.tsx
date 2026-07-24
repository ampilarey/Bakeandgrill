/**
 * Config-driven manual discount input + optional reason chips.
 * Extracted from OrderCart for focused vitest coverage.
 */
export type ManualDiscountControlsConfig = {
  manual_enabled: boolean;
  max_percent: number;
  max_fixed_mvr: number;
  reason_required: boolean;
  reasons: string[];
  approval_required?: boolean;
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
  disabled = false,
  mutedColor = "#64748B",
  borderColor = "#CBD5E1",
  textColor = "#0F172A",
}: Props) {
  if (!discountControls.manual_enabled) return null;

  const maxPct = discountControls.max_percent ?? 100;
  const maxFixed = discountControls.max_fixed_mvr ?? 0;
  const capParts: string[] = [];
  if (maxPct < 100) capParts.push(`max ${maxPct}%`);
  if (maxFixed > 0) capParts.push(`max MVR ${maxFixed.toFixed(2)}`);

  const showReasons =
    discountControls.reason_required && (Number.parseFloat(discountAmount) || 0) > 0;

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
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${discountFieldError ? "#FCA5A5" : borderColor}`,
            fontSize: 13,
            textAlign: "right",
            opacity: disabled ? 0.5 : 1,
          }}
        />
      </div>
      {discountFieldError && (
        <div role="alert" style={{ marginTop: 4, fontSize: 11, color: "#B91C1C" }}>
          {discountFieldError}
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
