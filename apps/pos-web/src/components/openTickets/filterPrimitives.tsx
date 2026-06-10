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
        padding: "10px 14px",
        minHeight: 44,
        borderRadius: radius.m,
        border: `1px solid ${active ? "#7C3AED" : palette.border}`,
        background: active ? "#7C3AED" : "#fff",
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
}: {
  options: ReadonlyArray<{ key: string; label: string; count: number; activeColor?: string }>;
  selected: string;
  onSelect: (key: string) => void;
  activeColor?: string;
}) {
  return (
    <>
      {options.map((opt) => {
        const active = opt.key === selected;
        const accent = opt.activeColor ?? groupActiveColor ?? "#0F172A";
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            style={{
              padding: "10px 14px",
              minHeight: 44,
              borderRadius: 999,
              border: `1px solid ${active ? accent : palette.border}`,
              background: active ? accent : "#fff",
              color: active ? "#fff" : palette.panelInk,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{opt.label}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: active ? "rgba(255,255,255,0.18)" : "#E2E8F0",
                color: active ? "#fff" : palette.panelMuted,
                padding: "1px 6px",
                borderRadius: 999,
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
      style={{ width: 1, height: 18, background: palette.border, margin: "0 2px" }}
    />
  );
}
