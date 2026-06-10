import { palette, radius, space, shadow, btnPrimary, btnSecondary, type, z } from "../../theme";
import { ticketDisplayTotal, type OpenTicket } from "../../utils/openTicketUtils";

export function MergeConfirmModal({
  target,
  source,
  busy,
  onCancel,
  onConfirm,
}: {
  target: OpenTicket;
  source: OpenTicket;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const combinedTotal = ticketDisplayTotal(target) + ticketDisplayTotal(source);
  const stageOf = (status: string | null | undefined, firedAt: string | null | undefined): "parked" | "cooking" => {
    if (status === "held" && !firedAt) return "parked";
    return "cooking";
  };
  const targetStage = stageOf(target.status, target.fired_at ?? null);
  const sourceStage = stageOf(source.status, source.fired_at ?? null);
  const crossStageWarning =
    targetStage !== sourceStage
      ? targetStage === "parked"
        ? "Source has already been fired to the kitchen — those items are being prepared. The merged ticket will be PARKED, so it won't appear on the KDS until you fire it. The cooks may finish the source items before you charge."
        : "Target is already cooking — its kitchen chit has been printed. The newly merged items WILL NOT auto-reprint. Open the merged ticket and tap 'Edit items' to reprint if the cooks need to see them."
      : null;
  const renderTicket = (t: OpenTicket, label: "Target — keeps" | "Source — cancelled") => (
    <div
      style={{
        flex: 1,
        padding: space.m,
        background: "#F8FAFC",
        borderRadius: radius.m,
        border: `1px solid ${palette.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: palette.panelMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, color: palette.panelInk, fontSize: type.body.fontSize }}>
        {t.ticket_name || t.order_number}
      </div>
      <div style={{ fontSize: type.caption.fontSize, color: palette.panelMuted }}>
        {(t.items?.length ?? 0)} items
        {t.customer?.name ? ` · ${t.customer.name}` : ""}
      </div>
      <div style={{ fontWeight: 800, color: palette.panelInk, fontSize: type.subtitle.fontSize, marginTop: 4 }}>
        MVR {ticketDisplayTotal(t).toFixed(2)}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm merge"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 100%)",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
        }}
      >
        <div>
          <div style={{ ...type.subtitle, color: palette.panelInk }}>🔀 Merge tickets?</div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            Items from the source ticket will move into the target. The source ticket will be
            <strong style={{ color: palette.dangerDark }}> cancelled</strong>.
          </div>
        </div>
        <div style={{ display: "flex", gap: space.s, alignItems: "stretch" }}>
          {renderTicket(target, "Target — keeps")}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: palette.panelMuted, flexShrink: 0 }}>
            ←
          </div>
          {renderTicket(source, "Source — cancelled")}
        </div>
        <div
          style={{
            padding: space.s + 2,
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: radius.m,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ ...type.bodySm, color: "#1E40AF", fontWeight: 700 }}>
            Combined total
          </span>
          <span style={{ ...type.subtitle, color: "#1E40AF", fontWeight: 800 }}>
            MVR {combinedTotal.toFixed(2)}
          </span>
        </div>
        {crossStageWarning && (
          <div
            role="alert"
            style={{
              padding: space.m,
              background: "#FEF3C7",
              border: "1px solid #FBBF24",
              borderRadius: radius.m,
              display: "flex",
              gap: space.s,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
            <span style={{ ...type.bodySm, color: "#78350F", fontWeight: 600, lineHeight: 1.4 }}>
              {crossStageWarning}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy} style={btnSecondary(busy)}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} style={btnPrimary(busy)}>
            {busy ? "Merging…" : "Confirm merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
