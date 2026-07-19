import { palette, radius } from "../../theme";

export function ScopeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        minHeight: 40,
        borderRadius: radius.m,
        border: `1px solid ${active ? palette.primary : palette.border}`,
        background: active ? palette.primary : palette.panel,
        color: active ? "#fff" : palette.panelInk,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function FilterGroup({
  options,
  selected,
  onSelect,
  activeColor: groupActiveColor,
  compact,
}: {
  options: ReadonlyArray<{ key: string; label: string; count: number; activeColor?: string }>;
  selected: string;
  onSelect: (key: string) => void;
  activeColor?: string;
  /** Slightly denser chips for the sticky filter strip. */
  compact?: boolean;
}) {
  return (
    <>
      {options.map((opt) => {
        const active = opt.key === selected;
        const accent = opt.activeColor ?? groupActiveColor ?? palette.primary;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            style={{
              padding: compact ? "6px 10px" : "8px 12px",
              minHeight: compact ? 36 : 40,
              borderRadius: radius.m,
              border: `1px solid ${active ? accent : palette.border}`,
              background: active ? accent : palette.panel,
              color: active ? "#fff" : palette.panelInk,
              fontSize: compact ? 12 : 13,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span>{opt.label}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: active ? "rgba(255,255,255,0.2)" : palette.bgAlt,
                color: active ? "#fff" : palette.panelMuted,
                padding: "1px 5px",
                borderRadius: radius.s,
                minWidth: 16,
                textAlign: "center",
              }}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function FilterDivider() {
  return (
    <span
      aria-hidden
      style={{ width: 1, height: 16, background: palette.border, margin: "0 2px", flexShrink: 0 }}
    />
  );
}
