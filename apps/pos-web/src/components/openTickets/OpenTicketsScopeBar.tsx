import { palette, radius, space } from "../../theme";
import { useMediaQuery } from "../../hooks/useMediaQuery";

type Props = {
  listScope: "all" | "mine" | "online";
  selectListScope: (scope: "all" | "mine" | "online") => void;
};

const SCOPES: Array<{ id: "all" | "mine" | "online"; label: string; short: string }> = [
  { id: "all", label: "All staff", short: "All" },
  { id: "mine", label: "Mine", short: "Mine" },
  { id: "online", label: "Online", short: "Online" },
];

export function OpenTicketsScopeBar({ listScope, selectListScope }: Props) {
  const isNarrow = useMediaQuery("(max-width: 840px)");

  if (isNarrow) {
    return (
      <div
        role="tablist"
        aria-label="Order scope"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4,
          marginBottom: space.s,
          padding: 4,
          background: palette.bgAlt,
          borderRadius: radius.m,
          border: `1px solid ${palette.border}`,
        }}
      >
        {SCOPES.map((s) => {
          const active = listScope === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectListScope(s.id)}
              style={{
                minHeight: 40,
                border: "none",
                borderRadius: radius.s,
                background: active ? palette.primary : "transparent",
                color: active ? "#fff" : palette.panelInk,
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {s.short}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: space.s,
      }}
    >
      {SCOPES.map((s) => {
        const active = listScope === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => selectListScope(s.id)}
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
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
