type Props = {
  visible: boolean;
  updateBlocked: boolean;
  applying: boolean;
  serverVersion: string | null;
  onUpdateNow: () => void;
  onLater: () => void;
};

/**
 * Non-blocking banner when a newer POS build is on the server.
 * Staff choose when to reload — never auto-refreshes mid-ticket.
 */
export function PosUpdateBanner({
  visible,
  updateBlocked,
  applying,
  serverVersion,
  onUpdateNow,
  onLater,
}: Props) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: "0 12px",
        padding: "10px 14px",
        borderRadius: 10,
        background: "#EFF6FF",
        border: "1px solid #BFDBFE",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1E3A8A" }}>
          New POS update available
        </div>
        <div style={{ fontSize: 12, color: "#1D4ED8", marginTop: 2 }}>
          {updateBlocked
            ? "Finish the current order or payment before updating."
            : "Please update after finishing the current order."}
          {serverVersion ? ` · v${serverVersion}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onLater}
          disabled={applying}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #93C5FD",
            background: "#fff",
            color: "#1D4ED8",
            fontWeight: 600,
            fontSize: 12,
            cursor: applying ? "wait" : "pointer",
            minHeight: 40,
          }}
        >
          Later
        </button>
        <button
          type="button"
          onClick={onUpdateNow}
          disabled={applying || updateBlocked}
          title={updateBlocked ? "Finish the current order or payment first" : undefined}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: updateBlocked ? "#94A3B8" : "#2563EB",
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            cursor: applying || updateBlocked ? "not-allowed" : "pointer",
            minHeight: 40,
          }}
        >
          {applying ? "Updating…" : "Update Now"}
        </button>
      </div>
    </div>
  );
}

/** Small version label for header / login footer / drawer. */
export function PosVersionLabel({
  version,
  build,
  light = false,
}: {
  version: string;
  build: string;
  light?: boolean;
}) {
  const shortBuild = build.length > 24 ? build.slice(0, 24) + "…" : build;
  return (
    <span
      title={`Build ${build}`}
      style={{
        fontSize: light ? 11 : 10,
        color: light ? "#94A3B8" : "#94A3B8",
        fontWeight: 500,
        lineHeight: 1.35,
        display: "block",
      }}
    >
      Bake & Grill POS v{version}
      <span style={{ display: "block", fontSize: light ? 10 : 9, opacity: 0.85 }}>
        Build {shortBuild}
      </span>
    </span>
  );
}
