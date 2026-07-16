type Props = {
  onOpenShift: () => void;
  onLogout: () => void;
  onSwitchUser?: () => void;
  canOpenShift?: boolean;
  error?: string;
};

/**
 * Hard gate shown when the cashier is logged in but no shift is open.
 * The POS UI is unreachable until they explicitly open a shift so cash
 * sales are always attributable to a drawer count.
 */
export function ShiftClosedGate({ onOpenShift, onLogout, onSwitchUser, canOpenShift = true, error }: Props) {
  return (
    <div
      className="pos-app-root"
      style={{
      minHeight: "100dvh", background: "#1C1408",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20,
        padding: 36, width: "100%", maxWidth: 460, textAlign: "center",
      }}>
        <p style={{ fontSize: 40, margin: "0 0 16px" }}>💰</p>
        <p style={{ fontWeight: 700, fontSize: 20, color: "#2A1E0C", margin: "0 0 10px" }}>
          No open shift
        </p>
        <p style={{ color: "#64748B", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
          {canOpenShift
            ? "Count the cash in your drawer and open a shift before ringing up sales. If you only need inventory or back-office tools, ask a manager to grant Operations access."
            : "You don't have permission to open a shift. Ask a manager or owner to open one for this station, or contact them to update your permissions."}
        </p>

        {error && (
          <div style={{
            background: "#FEE2E2", color: "#991B1B", borderRadius: 10,
            padding: "10px 14px", fontSize: 13, marginBottom: 16, textAlign: "left",
          }}>
            {error}
          </div>
        )}

        {canOpenShift && (
          <button onClick={onOpenShift} style={{
            width: "100%", padding: "14px 22px", borderRadius: 12,
            background: "#10B981", color: "#fff", border: "none",
            fontWeight: 700, fontSize: 16, cursor: "pointer",
            marginBottom: 12,
          }}>
            Open shift
          </button>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {onSwitchUser && (
            <button onClick={onSwitchUser} style={linkBtn}>Switch user</button>
          )}
          <button onClick={onLogout} style={linkBtn}>Log out</button>
        </div>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "#94A3B8",
  fontSize: 13, cursor: "pointer", textDecoration: "underline",
};
