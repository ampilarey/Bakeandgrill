import { palette, radius, space, shadow, type } from "../../theme";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export function PanelShell({
  title,
  subtitle,
  onClose,
  children,
  toolbar,
  backMode,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Sticky chrome (scope + filters) — stays visible while the list scrolls. */
  toolbar?: React.ReactNode;
  /** When true, the header action is a back chevron instead of close. */
  backMode?: boolean;
}) {
  const isNarrow = useMediaQuery("(max-width: 840px)");
  const useBack = backMode ?? isNarrow;

  return (
    <div
      className={isNarrow ? "pos-open-tickets-shell" : undefined}
      style={{
        flex: 1,
        minHeight: 0,
        background: palette.panel,
        borderRadius: isNarrow ? 0 : radius.xl,
        border: isNarrow ? "none" : `1px solid ${palette.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: isNarrow ? "none" : shadow.xs,
      }}
    >
      <div style={{
        padding: isNarrow
          ? `${space.s}px ${space.m}px`
          : `${space.m}px ${space.l}px`,
        paddingTop: isNarrow
          ? `max(${space.s}px, env(safe-area-inset-top, 0px))`
          : undefined,
        borderBottom: `1px solid ${palette.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: space.m,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: space.s, minWidth: 0, flex: 1 }}>
          {useBack && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: palette.bgAlt,
                border: `1px solid ${palette.border}`,
                color: palette.panelInk,
                fontSize: 22,
                cursor: "pointer",
                lineHeight: 1,
                padding: 6,
                minHeight: 44,
                minWidth: 44,
                borderRadius: radius.m,
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              ...type.subtitle,
              color: palette.panelInk,
              fontSize: isNarrow ? 17 : type.subtitle.fontSize,
            }}>
              {title}
            </div>
            {subtitle && !isNarrow && (
              <div style={{ ...type.caption, color: palette.panelMuted, marginTop: 2 }}>
                {subtitle}
              </div>
            )}
            {subtitle && isNarrow && (
              <div style={{
                ...type.caption,
                color: palette.panelMuted,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {!useBack && (
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

      {toolbar != null && (
        <div style={{
          flexShrink: 0,
          padding: isNarrow
            ? `${space.s}px ${space.m}px`
            : `${space.s}px ${space.l}px ${space.m}px`,
          borderBottom: `1px solid ${palette.border}`,
          background: palette.bg,
        }}>
          {toolbar}
        </div>
      )}

      <div
        className={isNarrow ? "pos-open-tickets-list" : undefined}
        style={{
          flex: 1,
          overflow: "auto",
          padding: isNarrow ? space.m : space.l,
          paddingBottom: isNarrow
            ? `max(${space.l}px, env(safe-area-inset-bottom, 0px))`
            : space.l,
          minHeight: 0,
          WebkitOverflowScrolling: "touch",
        }}
      >
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
