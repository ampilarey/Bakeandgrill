import { useCallback, useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary, palette, radius, shadow, space, type, z } from "../theme";

type Props = {
  error?: string;
  busy?: boolean;
  resending?: boolean;
  onConfirm: (code: string) => void | Promise<void>;
  onResend: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * SMS OTP entry for manager discount approval. Reuses the LockScreen
 * PIN-pad pattern but is fixed at 4 digits (server codes are always 4).
 */
export function DiscountApprovalModal({
  error,
  busy = false,
  resending = false,
  onConfirm,
  onResend,
  onCancel,
}: Props) {
  const [code, setCode] = useState("");
  const [localErr, setLocalErr] = useState("");
  const submittingRef = useRef(false);

  // Clear local pad state when the server error changes (wrong code).
  useEffect(() => {
    if (error) {
      setCode("");
      setLocalErr("");
      submittingRef.current = false;
    }
  }, [error]);

  const submit = useCallback(async () => {
    if (submittingRef.current || busy) return;
    if (code.length !== 4) {
      setLocalErr("Enter the 4-digit code.");
      return;
    }
    submittingRef.current = true;
    setLocalErr("");
    try {
      await onConfirm(code);
    } finally {
      submittingRef.current = false;
    }
  }, [code, busy, onConfirm]);

  useEffect(() => {
    if (code.length !== 4) return;
    if (error || localErr) return;
    if (busy || submittingRef.current) return;
    const id = window.setTimeout(() => {
      void submit();
    }, 200);
    return () => window.clearTimeout(id);
  }, [code, error, localErr, busy, submit]);

  const tap = (d: string) => {
    setLocalErr("");
    if (d === "⌫") setCode((p) => p.slice(0, -1));
    else if (d) setCode((p) => (p.length >= 4 ? p : p + d));
  };

  const displayErr = error || localErr;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enter approval code"
      style={{
        position: "fixed",
        inset: 0,
        // Above ChargeOverlay (z.overlay = 900).
        zIndex: z.overlay + 50,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
      }}
    >
      <div
        style={{
          background: palette.panel,
          borderRadius: radius.xl,
          padding: 28,
          width: "100%",
          maxWidth: 340,
          textAlign: "center",
          boxShadow: shadow.xl,
        }}
      >
        <p style={{ ...type.subtitle, color: palette.panelInk, margin: "0 0 4px" }}>
          Enter approval code
        </p>
        <p style={{ ...type.bodySm, color: palette.panelMuted, margin: "0 0 20px" }}>
          Code sent to the manager.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 10,
            marginBottom: 20,
            minHeight: 24,
            alignItems: "center",
          }}
        >
          {code.length === 0 ? (
            <span style={{ color: palette.panelSubtle, fontSize: 13 }}>••••</span>
          ) : (
            Array.from({ length: code.length }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: palette.primary,
                }}
              />
            ))
          )}
        </div>

        {displayErr && (
          <div
            role="alert"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: "#FEE2E2",
              color: "#B91C1C",
              fontSize: 12,
              marginBottom: 12,
              textAlign: "left",
            }}
          >
            {displayErr}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
            <button
              key={i}
              type="button"
              aria-label={d === "⌫" ? "Backspace" : d === "" ? undefined : `Digit ${d}`}
              onClick={() => tap(d)}
              disabled={d === "" || busy}
              style={{
                height: 56,
                borderRadius: 12,
                border: `1px solid ${palette.border}`,
                background: d === "" ? "transparent" : palette.bgAlt,
                fontSize: 18,
                fontWeight: 700,
                color: palette.panelInk,
                cursor: d === "" || busy ? "default" : "pointer",
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || code.length !== 4}
          style={{
            ...btnPrimary(busy || code.length !== 4),
            marginTop: 14,
            width: "100%",
          }}
        >
          {busy ? "Confirming…" : "Confirm"}
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={busy || resending}
            style={{ ...btnSecondary(busy || resending), flex: 1 }}
          >
            {resending ? "Sending…" : "Resend"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ ...btnSecondary(busy), flex: 1 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
