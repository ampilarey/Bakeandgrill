import { useEffect } from "react";
import { z } from "../theme";
import { useLongPress } from "../hooks/useLongPress";
import { PosVersionLabel } from "./PosUpdateBanner";

export type DrawerItem = {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  badgeCritical?: boolean;
  disabled?: boolean;
  group?: "main" | "user";
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: DrawerItem[];
  active: string;
  onSelect: (id: string) => void;
  /**
   * Press-and-hold on a nav row. Used to pin the destination to the header.
   * Rows the caller does not want pinnable simply are not reported.
   */
  onLongPress?: (item: DrawerItem) => void;
  cashierName?: string;
  shiftLabel?: string;
  /** Mobile replacement for the hidden topbar sales chip (≤840px). */
  shiftSalesSummary?: string | null;
  appVersion?: string;
  appBuild?: string;
  updatePending?: boolean;
};

/**
 * Loyverse-style left drawer nav. Replaces the old POS/OPS toggle.
 * Keeps Sales (the cart) as the home destination and exposes every
 * other workflow (Receipts, Shift, Open Tickets, History, Switch User,
 * Log out) one tap away.
 */
export function SideDrawer({
  open,
  onClose,
  items,
  active,
  onSelect,
  onLongPress,
  cashierName,
  shiftLabel,
  shiftSalesSummary,
  appVersion,
  appBuild,
  updatePending,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const main = items.filter((i) => (i.group ?? "main") === "main");
  const user = items.filter((i) => i.group === "user");

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: z.drawerBackdrop,
            background: "rgba(15,23,42,0.55)",
          }}
          aria-label="Close menu"
        />
      )}
      <aside
        role="dialog"
        aria-label="Main menu"
        className="pos-side-drawer"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: z.drawerPanel,
          width: "min(280px, calc(100vw - 48px))", background: "#0F172A", color: "#fff",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.18s ease",
          display: "flex", flexDirection: "column",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <header style={{
          padding: "18px 20px", borderBottom: "1px solid #1E293B",
          flexShrink: 0,
        }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{cashierName ?? "Cashier"}</div>
          {shiftLabel && (
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{shiftLabel}</div>
          )}
          {shiftSalesSummary && (
            <div style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#1E293B",
              fontSize: 12,
              fontWeight: 700,
              color: "#F8FAFC",
              fontVariantNumeric: "tabular-nums",
            }}>
              {shiftSalesSummary}
            </div>
          )}
        </header>

        <nav style={{ flex: 1, padding: "12px 0", overflow: "auto" }}>
          {main.map((it) => (
            <Item
              key={it.id}
              item={it}
              active={active === it.id}
              onClick={() => onSelect(it.id)}
              onLongPress={onLongPress ? () => onLongPress(it) : undefined}
            />
          ))}
          {user.length > 0 && (
            <>
              <div style={{ height: 1, background: "#1E293B", margin: "12px 16px" }} />
              {user.map((it) => (
                <Item key={it.id} item={it} active={active === it.id} onClick={() => onSelect(it.id)} />
              ))}
            </>
          )}
        </nav>

        {(appVersion && appBuild) && (
          <footer style={{
            padding: "14px 20px",
            borderTop: "1px solid #1E293B",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}>
            <PosVersionLabel version={appVersion} build={appBuild} light />
            {updatePending && (
              <span style={{ fontSize: 11, color: "#FCD34D", fontWeight: 600 }}>
                ● Update ready — use banner or Update app
              </span>
            )}
          </footer>
        )}
      </aside>
    </>
  );
}

function Item({ item, active, onClick, onLongPress }: {
  item: DrawerItem;
  active: boolean;
  onClick: () => void;
  /** Absent for rows that cannot be pinned — the user group, and anything disabled. */
  onLongPress?: () => void;
}) {
  const { handlers, clickGuard } = useLongPress(() => onLongPress?.());
  const pressable = !!onLongPress && !item.disabled;

  return (
    <button
      onClick={pressable ? clickGuard(onClick) : onClick}
      {...(pressable ? handlers : {})}
      aria-label={pressable ? `${item.label} — press and hold to add to header` : undefined}
      disabled={item.disabled}
      style={{
        width: "100%", textAlign: "left",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 12,
        background: active ? "#1E293B" : "transparent", color: item.disabled ? "#475569" : "#fff",
        border: "none", cursor: item.disabled ? "not-allowed" : "pointer",
        fontSize: 14, fontWeight: 600,
        borderLeft: `3px solid ${active ? "#D4813A" : "transparent"}`,
      }}
    >
      <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{item.icon}</span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.badge && (
        <span style={{
          background: item.badgeCritical ? "#B91C1C" : "#D4813A", color: "#fff",
          fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
        }}>{item.badge}</span>
      )}
    </button>
  );
}
