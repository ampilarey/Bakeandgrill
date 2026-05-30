import { palette, radius, space, type } from "../theme";

type Props = {
  cashierName: string;
  onLogout: () => void;
  onSwitchUser?: () => void;
  kdsUrl?: string;
};

const defaultKdsUrl =
  (import.meta.env.VITE_KDS_URL as string | undefined) ?? "/kds";

export function KitchenStaffLanding({
  cashierName,
  onLogout,
  onSwitchUser,
  kdsUrl = defaultKdsUrl,
}: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
        background: "#F8FAFC",
        color: palette.panelInk,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: palette.panel,
          borderRadius: radius.l,
          padding: space.xl,
          boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
          textAlign: "center",
        }}
      >
        <img
          src="/logo.png"
          alt="Bake & Grill"
          style={{ width: 56, height: 56, borderRadius: 12, marginBottom: space.m }}
        />
        <h1 style={{ margin: `0 0 ${space.s}px`, fontSize: type.title.fontSize, fontWeight: 700 }}>
          Kitchen display
        </h1>
        <p style={{ margin: `0 0 ${space.l}px`, color: palette.panelMuted, lineHeight: 1.5, fontSize: type.body.fontSize }}>
          Signed in as <strong>{cashierName || "Kitchen staff"}</strong>.
          Open the kitchen display to view and prepare tickets. Cashiers handle payments and mark orders ready for customers.
        </p>
        <a
          href={kdsUrl}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            padding: `${space.m}px ${space.l}px`,
            borderRadius: radius.m,
            background: "#1C1408",
            color: "#fff",
            fontWeight: 700,
            fontSize: type.body.fontSize,
            textDecoration: "none",
            marginBottom: space.m,
          }}
        >
          Open Kitchen Display →
        </a>
        <div style={{ display: "flex", gap: space.s, justifyContent: "center", flexWrap: "wrap" }}>
          {onSwitchUser && (
            <button
              type="button"
              onClick={onSwitchUser}
              style={{
                padding: `${space.s}px ${space.m}px`,
                borderRadius: radius.m,
                border: `1px solid ${palette.border}`,
                background: "#fff",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: type.bodySm.fontSize,
              }}
            >
              Switch user
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            style={{
              padding: `${space.s}px ${space.m}px`,
              borderRadius: radius.m,
              border: "none",
              background: palette.border,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: type.bodySm.fontSize,
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
