import { useState } from "react";
import { palette, radius, space, shadow, btnPrimary, btnSecondary, type, z } from "../../theme";
import type { OpenTicket } from "../../utils/openTicketUtils";
import { splitSelectedItemsTotal } from "./splitItemTotals";

export function SplitItemPicker({
  ticket,
  onCancel,
  onConfirm,
}: {
  ticket: OpenTicket;
  onCancel: () => void;
  onConfirm: (itemIds: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const items = ticket.items ?? [];
  const totalCount = items.length;
  const allSelected = selected.size === totalCount;
  const noneSelected = selected.size === 0;
  const splitTotal = splitSelectedItemsTotal(items, selected);

  const toggle = (id: number) => {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Split ticket"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        zIndex: z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.l,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          background: palette.panel,
          borderRadius: radius.xl,
          boxShadow: shadow.xl,
          padding: space.xl,
          display: "flex",
          flexDirection: "column",
          gap: space.m,
          maxHeight: "85vh",
          overflow: "hidden",
        }}
      >
        <div>
          <div style={{ ...type.subtitle, color: palette.panelInk }}>
            ✂️ Split items off ticket
          </div>
          <div style={{ ...type.bodySm, color: palette.panelMuted, marginTop: 4 }}>
            Order <strong style={{ color: palette.panelInk }}>{ticket.order_number}</strong> · pick the
            items to move into a brand-new ticket.
          </div>
        </div>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            border: `1px solid ${palette.border}`,
            borderRadius: radius.m,
            padding: space.s,
            background: "#F8FAFC",
            display: "flex",
            flexDirection: "column",
            gap: space.xs,
          }}
        >
          {items.map((it) => {
            const checked = selected.has(it.id);
            return (
              <label
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: space.s,
                  padding: space.s,
                  background: checked ? "#EFF6FF" : "#fff",
                  border: `1px solid ${checked ? "#93C5FD" : palette.border}`,
                  borderRadius: radius.s,
                  cursor: "pointer",
                  fontSize: type.bodySm.fontSize,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(it.id)}
                  style={{ width: 18, height: 18, accentColor: "#1D4ED8" }}
                />
                <span style={{ flex: 1, color: palette.panelInk }}>
                  {it.quantity}× {it.item_name}
                </span>
                <span style={{ color: palette.panelMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
                  MVR {Number(it.total_price ?? 0).toFixed(2)}
                </span>
              </label>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ ...type.bodySm, color: palette.panelMuted }}>
            {selected.size} of {totalCount} items · split MVR {splitTotal.toFixed(2)}
          </div>
          {allSelected && (
            <span style={{ ...type.caption, color: palette.dangerDark, fontWeight: 700 }}>
              Pick fewer — can't split every item.
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: space.s, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnSecondary()}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={noneSelected || allSelected}
            style={btnPrimary(noneSelected || allSelected)}
          >
            Split into new ticket
          </button>
        </div>
      </div>
    </div>
  );
}
