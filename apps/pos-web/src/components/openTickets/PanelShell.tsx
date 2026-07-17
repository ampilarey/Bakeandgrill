import { palette, radius, space, shadow, type } from "../../theme";

export function PanelShell({ title, subtitle, onClose, children, backMode }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** When true, the header action is a back chevron instead of close. */
  backMode?: boolean;
}) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      background: palette.panel,
      borderRadius: radius.xl,
      border: `1px solid ${palette.border}`,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: shadow.xs,
    }}>
      <div style={{
        padding: space.l,
        borderBottom: `1px solid ${palette.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: space.m,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: space.s, minWidth: 0 }}>
          {backMode && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: palette.panelInk,
                fontSize: 22,
                cursor: "pointer",
                lineHeight: 1,
                padding: 6,
                minHeight: 44,
                minWidth: 44,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              aria-label="Back"
            >
              ‹
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ ...type.subtitle, color: palette.panelInk }}>{title}</div>
            {subtitle && <div style={{ ...type.caption, color: palette.panelMuted, marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        {!backMode && (
          <button onClick={onClose} style={{
            background: "none",
            border: "none",
            color: palette.panelMuted,
            fontSize: 26,
            cursor: "pointer",
            lineHeight: 1,
            padding: 6,
            minHeight: 44,
            minWidth: 44,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }} aria-label="Close panel">×</button>
        )}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: space.l }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: space.huge,
      color: palette.panelSubtle,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 44, marginBottom: space.m }}>{emoji}</div>
      <div style={{ ...type.body, fontWeight: 700, color: palette.panelMuted }}>{title}</div>
      <div style={{ ...type.caption, marginTop: 4, maxWidth: 280 }}>{body}</div>
    </div>
  );
}
