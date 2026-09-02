import { useEffect, useRef } from "react";
import { z } from "../theme";
import type { Item } from "../types";
import type { QuickScope, ScopedQuickTab } from "../utils/quickTabs";

export type QuickKeyAction =
  | { kind: "add"; scope: QuickScope; tabId: string }
  | { kind: "remove"; scope: QuickScope; tabId: string }
  | { kind: "move"; scope: QuickScope; tabId: string; delta: -1 | 1 }
  /** No tab of my own yet: start one with this item. */
  | { kind: "add-new" };

type Props = {
  item: Item;
  /** Every tab the cashier may put things on — their own, and the shared ones if they manage the menu. */
  tabs: ScopedQuickTab[];
  maxItems: number;
  canAddOwnTab: boolean;
  onAction: (action: QuickKeyAction) => void;
  onClose: () => void;
};

/**
 * The sheet a press-and-hold on a menu tile raises.
 *
 * One row per tab: add to it, or — when the item is already there — move it
 * earlier or later, or take it off. Same gesture and same confirm step as
 * the header shortcuts: a hold is easy to do by accident on a busy till, so
 * nothing rearranges without being asked. Owner, 2026-09-02.
 */
export function QuickKeyPrompt({ item, tabs, maxItems, canAddOwnTab, onAction, onClose }: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => firstRef.current?.focus(), 0);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: Array<{ label: string; action: QuickKeyAction; tone?: "danger" }> = [];
  for (const tab of tabs) {
    const noun = tab.scope === "shared" ? `${tab.name} (shared)` : tab.name;
    const at = tab.items.indexOf(item.id);
    if (at < 0) {
      if (tab.items.length < maxItems) rows.push({ label: `Add to ${noun}`, action: { kind: "add", scope: tab.scope, tabId: tab.id } });
      continue;
    }
    if (at > 0) rows.push({ label: `Move earlier in ${noun}`, action: { kind: "move", scope: tab.scope, tabId: tab.id, delta: -1 } });
    if (at < tab.items.length - 1) rows.push({ label: `Move later in ${noun}`, action: { kind: "move", scope: tab.scope, tabId: tab.id, delta: 1 } });
    rows.push({ label: `Remove from ${noun}`, action: { kind: "remove", scope: tab.scope, tabId: tab.id }, tone: "danger" });
  }
  if (canAddOwnTab) rows.push({ label: "Add to a new tab of my own", action: { kind: "add-new" } });

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: z.drawerBackdrop, background: "rgba(15,23,42,0.55)" }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quick tabs: ${item.name}`}
        data-testid="quick-key-prompt"
        style={{
          position: "fixed", zIndex: z.drawerPanel,
          left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          width: "min(380px, calc(100vw - 40px))",
          maxHeight: "min(80dvh, 640px)", overflowY: "auto",
          background: "#fff", borderRadius: 16, padding: 18,
          boxShadow: "0 20px 60px rgba(15,23,42,0.28)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span aria-hidden="true" style={{ fontSize: 24 }}>★</span>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.name}
          </p>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: "#475569" }}>
          {rows.length === 0
            ? `Every tab is full — each holds ${maxItems}. Take something off one first.`
            : "Quick tabs are the first tabs on the till. Yours follow you to any till."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row, index) => (
            <button
              key={row.label}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onAction(row.action)}
              style={{
                minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
                background: row.tone === "danger" ? "#FEE2E2" : "#F8FAFC",
                border: `1px solid ${row.tone === "danger" ? "#FCA5A5" : "#CBD5E1"}`,
                color: row.tone === "danger" ? "#B91C1C" : "#0F172A",
                textAlign: "left", padding: "0 14px",
              }}
            >
              {row.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14,
              background: "#fff", border: "none", color: "#64748B", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
