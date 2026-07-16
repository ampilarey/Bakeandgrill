import { palette, radius, space, type } from "../theme";
import type { CSSProperties } from "react";

type Props = {
  cashierName: string;
  onLogout: () => void;
  onSwitchUser?: () => void;
  kdsUrl?: string;
  onRequestItems?: () => void;
  onMyRequests?: () => void;
  onBuyingList?: () => void;
};

const defaultKdsUrl =
  (import.meta.env.VITE_KDS_URL as string | undefined) ?? "/kds";

export function KitchenStaffLanding({
  cashierName,
  onLogout,
  onSwitchUser,
  kdsUrl = defaultKdsUrl,
  onRequestItems,
  onMyRequests,
  onBuyingList,
}: Props) {
  const actionBtn: CSSProperties = {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: `${space.m}px ${space.l}px`,
    borderRadius: radius.m,
    fontWeight: 700,
    fontSize: type.body.fontSize,
    textDecoration: "none",
    marginBottom: space.m,
    cursor: "pointer",
    textAlign: "center",
    border: "none",
  };

  return (
    <div
      className="pos-app-root"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: space.l,
        background: "#F8FAFC",
        color: palette.panelInk,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          margin: "auto",
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
          Open the kitchen display to view and prepare tickets.
        </p>
        <a
          href={kdsUrl}
          style={{ ...actionBtn, background: "#1C1408", color: "#fff" }}
        >
          Open Kitchen Display →
        </a>
        {onRequestItems && (
          <button type="button" onClick={onRequestItems} style={{ ...actionBtn, background: "#fff", color: palette.panelInk, border: `1px solid ${palette.border}` }}>
            Request items
          </button>
        )}
        {onMyRequests && (
          <button type="button" onClick={onMyRequests} style={{ ...actionBtn, background: "#fff", color: palette.panelInk, border: `1px solid ${palette.border}` }}>
            My requests
          </button>
        )}
        {onBuyingList && (
          <button type="button" onClick={onBuyingList} style={{ ...actionBtn, background: "#fff", color: palette.panelInk, border: `1px solid ${palette.border}` }}>
            Buying list
          </button>
        )}
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
