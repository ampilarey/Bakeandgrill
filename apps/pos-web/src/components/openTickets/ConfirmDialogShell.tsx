import type { ReactNode } from "react";
import { palette, radius, space, shadow, z } from "../../theme";

/**
 * Shared backdrop + panel used by Open Tickets confirm modals
 * (void, fire-early, etc.) so staff see one familiar pattern.
 */
export function ConfirmDialogShell({
  ariaLabel,
  busy,
  onCancel,
  children,
  maxWidth = 460,
}: {
  ariaLabel: string;
  busy: boolean;
  onCancel: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        animation: "pos-fade-in 120ms ease",
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${maxWidth}px, 100%)`,
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
          animation: "pos-scale-in 140ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
