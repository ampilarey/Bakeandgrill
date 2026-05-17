import { useEffect } from "react";

export type DrawerItem = {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  disabled?: boolean;
  group?: "main" | "user";
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: DrawerItem[];
  active: string;
  onSelect: (id: string) => void;
  cashierName?: string;
  shiftLabel?: string;
};

/**
 * Loyverse-style left drawer nav. Replaces the old POS/OPS toggle.
 * Keeps Sales (the cart) as the home destination and exposes every
 * other workflow (Receipts, Shift, Open Tickets, History, Switch User,
 * Log out) one tap away.
 */
export function SideDrawer({ open, onClose, items, active, onSelect, cashierName, shiftLabel }: Props) {
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
            position: "fixed", inset: 0, zIndex: 700,
            background: "rgba(15,23,42,0.55)",
          }}
          aria-label="Close menu"
        />
      )}
      <aside
        role="dialog"
        aria-label="Main menu"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 701,
          width: 280, background: "#0F172A", color: "#fff",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.18s ease",
          display: "flex", flexDirection: "column",
        }}
      >
        <header style={{
          padding: "18px 20px", borderBottom: "1px solid #1E293B",
        }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{cashierName ?? "Cashier"}</div>
          {shiftLabel && (
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{shiftLabel}</div>
          )}
        </header>

        <nav style={{ flex: 1, padding: "12px 0", overflow: "auto" }}>
          {main.map((it) => (
            <Item key={it.id} item={it} active={active === it.id} onClick={() => onSelect(it.id)} />
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
      </aside>
    </>
  );
}

function Item({ item, active, onClick }: { item: DrawerItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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
          background: "#D4813A", color: "#fff",
          fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
        }}>{item.badge}</span>
      )}
    </button>
  );
}
