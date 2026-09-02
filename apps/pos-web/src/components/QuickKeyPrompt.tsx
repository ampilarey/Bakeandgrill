import { useEffect, useRef } from "react";
import { z } from "../theme";
import type { Item } from "../types";

export type QuickKeyAction =
  | { kind: "add"; scope: "mine" | "shared" }
  | { kind: "remove"; scope: "mine" | "shared" }
  | { kind: "move"; scope: "mine" | "shared"; delta: -1 | 1 };

type Props = {
  item: Item;
  /** Where the item currently sits in each set; null when not in it. */
  position: { mine: number | null; shared: number | null };
  sizes: { mine: number; shared: number };
  max: number;
  canManageShared: boolean;
  onAction: (action: QuickKeyAction) => void;
  onClose: () => void;
};

/**
 * The sheet a press-and-hold on a menu tile raises.
 *
 * Owner, 2026-09-02: a cashier keeps their own Quick tab; a menu manager
 * keeps the shared one every till starts from. Same gesture and same confirm
 * step as the header shortcuts — a hold is easy to do by accident on a busy
 * till, so nothing rearranges without being asked.
 */
export function QuickKeyPrompt({
  item, position, sizes, max, canManageShared, onAction, onClose,
}: Props) {
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => firstRef.current?.focus(), 0);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: Array<{ label: string; action: QuickKeyAction; tone?: "danger" }> = [];

  const scopeRows = (scope: "mine" | "shared", noun: string) => {
    const at = position[scope];
    const size = sizes[scope];
    if (at === null) {
      if (size < max) rows.push({ label: `Add to ${noun}`, action: { kind: "add", scope } });
      return;
    }
    if (at > 0) rows.push({ label: `Move earlier in ${noun}`, action: { kind: "move", scope, delta: -1 } });
    if (at < size - 1) rows.push({ label: `Move later in ${noun}`, action: { kind: "move", scope, delta: 1 } });
    rows.push({ label: `Remove from ${noun}`, action: { kind: "remove", scope }, tone: "danger" });
  };

  scopeRows("mine", "my Quick keys");
  if (canManageShared) scopeRows("shared", "the shared Quick keys");

  const full = position.mine === null && sizes.mine >= max;

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
        aria-label={`Quick keys: ${item.name}`}
        data-testid="quick-key-prompt"
        style={{
          position: "fixed", zIndex: z.drawerPanel,
          left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          width: "min(360px, calc(100vw - 40px))",
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
          {full
            ? `Your Quick tab is full — it holds ${max}. Remove one to make room.`
            : "The Quick tab is the first tab on the till. Yours follows you to any till; the shared one is what everyone starts with."}
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
