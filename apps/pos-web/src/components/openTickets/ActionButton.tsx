import { useEffect, useRef, useState } from "react";
import { radius, space, type } from "../../theme";

/**
 * Stage-action button used inside each ticket row. Centralises the
 * stopPropagation + busy/disabled styling so the row's own
 * click-to-edit handler doesn't fire when the cashier taps a chip.
 */
export function ActionButton({
  onClick,
  busy,
  bg,
  children,
  confirm = false,
  confirmLabel = "Tap again to confirm",
}: {
  onClick: () => void;
  busy: boolean;
  bg: string;
  children: React.ReactNode;
  confirm?: boolean;
  confirmLabel?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (busy && pending) {
      setPending(false);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [busy, pending]);

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!confirm) {
      onClick();
      return;
    }
    if (pending) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPending(false);
      onClick();
    } else {
      setPending(true);
      timerRef.current = window.setTimeout(() => {
        setPending(false);
        timerRef.current = null;
      }, 2500);
    }
  };

  return (
    <button
      onClick={handleTap}
      disabled={busy}
      style={{
        padding: `${space.s}px ${space.m}px`,
        minHeight: 44,
        fontSize: type.bodySm.fontSize,
        borderRadius: radius.m,
        fontWeight: 700,
        background: pending ? "#B45309" : bg,
        color: "#fff",
        border: pending ? "2px solid #FBBF24" : "none",
        boxSizing: "border-box",
        cursor: busy ? "not-allowed" : "pointer",
      }}
    >
      {busy ? "…" : pending ? confirmLabel : children}
    </button>
  );
}
