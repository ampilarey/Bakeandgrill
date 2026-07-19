import { useEffect, useMemo, useState } from "react";
import { Card, Field, Overlay } from "./OpenShiftModal";
import type { PosCustomer } from "../api";
import type { RestaurantTable } from "../types";
import { tableIsInUse } from "../utils/tableLabels";

import type { PosOrderType } from "../orderTypes";

type OrderType = PosOrderType;

function composeTicketName(
  customer: PosCustomer | null,
  table: RestaurantTable | null,
  defaultName?: string,
): string {
  const parts: string[] = [];
  if (customer?.name) parts.push(customer.name);
  if (table) parts.push(`Table ${table.name}`);
  if (parts.length === 0 && customer?.phone) parts.push(customer.phone);
  if (parts.length === 0 && defaultName) parts.push(defaultName);
  if (parts.length === 0) {
    parts.push(`Ticket ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }
  return parts.join(" · ");
}

type Props = {
  /** Customer currently attached to the cart (via CustomerPicker). Used
   *  to pre-fill the ticket name and show the cashier exactly who this
   *  parked ticket is for. */
  attachedCustomer: PosCustomer | null;
  /** All restaurant tables, for the in-modal table picker. */
  tables: RestaurantTable[];
  /** Currently selected table from the cart. */
  selectedTableId: number | null;
  /** Setter so the cashier can pick a table without leaving the modal. */
  setSelectedTableId: (id: number | null) => void;
  /** Current order type — needed so we can flip to Dine-in when the
   *  cashier picks a table here (the backend only persists table_id on
   *  dine-in orders). */
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  /** Saved-name override — preserved from the existing single-arg
   *  callsite so we don't break the timestamp-fallback path. */
  defaultName?: string;
  /**
   * Phone-call pickup workflow: when the cashier rings up a Pickup
   * ticket and saves, ask whether to fire it to the kitchen NOW
   * (most common — customer expects food cooking) or LATER (park,
   * cashier will fire it manually from Open Tickets when ready).
   *
   * Defaults to "fire now" for Pickup tickets, "later" for Dine-in
   * (cashier usually saves a Dine-in to come back to it with more
   * items — firing immediately would print a half-complete chit).
   *
   * The cashier can override either default with the toggle.
   */
  onConfirm: (name: string, note: string | undefined, fireToKitchen: boolean) => Promise<void>;
  onCancel: () => void;
};

/**
 * Loyverse-style "Save ticket" sheet with cart-aware pre-fill.
 *
 * If the cashier already attached a customer (phone/name via the
 * CustomerPicker) and/or picked a table, those facts are shown
 * prominently and the ticket name is auto-suggested — typically
 * "Aisha · Table 4" so the cashier can find it again at a glance in
 * Open Tickets.
 *
 * Cashiers can also pick a table from inside this modal without
 * having to flip the cart back to the segmented control above. If
 * they pick a table while the order is set to Takeaway/Pickup we
 * silently flip the order type to Dine-in because table_id is only
 * persisted on dine-in orders backend-side.
 */
export function SaveTicketModal({
  attachedCustomer,
  tables,
  selectedTableId,
  setSelectedTableId,
  orderType,
  setOrderType,
  defaultName,
  onConfirm,
  onCancel,
}: Props) {
  const currentTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId],
  );

  /**
   * Compose a smart default ticket name from the cart context. Order
   * of preference, since cashiers usually find tickets by the most
   * memorable identifier:
   *   customer name → table → customer phone → defaultName → time
   *
   * "Aisha · Table 4" beats "Ticket 14:32" every time.
   */
  const suggestedName = useMemo(
    () => composeTicketName(attachedCustomer, currentTable, defaultName),
    [attachedCustomer, currentTable, defaultName],
  );

  const [name, setName] = useState(suggestedName);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Pickup / Delivery tickets default to "Fire now" — the customer called
  // and expects food cooking. Dine-in / Takeaway tickets default to
  // "Later" — those are usually parked because the cashier is
  // adding more items or waiting on something.
  const [fireToKitchen, setFireToKitchen] = useState(
    orderType === "Pickup" || orderType === "Delivery",
  );

  // Sticky seat from a previous ticket must not pre-fill another park
  // as "Table 1" when that seat is already owned by an open check.
  useEffect(() => {
    if (selectedTableId == null) return;
    const sticky = tables.find((t) => t.id === selectedTableId);
    if (!sticky || !tableIsInUse(sticky)) return;
    setSelectedTableId(null);
    setName((prev) => {
      const next = composeTicketName(attachedCustomer, null, defaultName);
      const stale = composeTicketName(attachedCustomer, sticky, defaultName);
      return prev === stale || prev.trim() === "" ? next : prev;
    });
  }, [attachedCustomer, defaultName, selectedTableId, setSelectedTableId, tables]);

  const submit = async () => {
    const n = name.trim();
    if (!n) { setErr("Give the ticket a name so you can find it later."); return; }
    setBusy(true);
    try { await onConfirm(n, note.trim() || undefined, fireToKitchen); }
    catch (e) { setErr((e as Error).message || "Could not save ticket."); }
    finally { setBusy(false); }
  };

  const handlePickTable = (id: number | null) => {
    setSelectedTableId(id);
    // Picking a table only makes sense on a Dine-in ticket — the
    // backend drops restaurant_table_id for other types. Silently
    // promote to Dine-in so the cashier's choice actually sticks.
    if (id != null && orderType !== "Dine-in") setOrderType("Dine-in");
    // Re-derive the suggested name so the new "· Table X" shows up
    // immediately — but only if the cashier hasn't already typed
    // a custom name we'd be overwriting.
    if (name === suggestedName || name.trim() === "") {
      const newTable = tables.find((t) => t.id === id) ?? null;
      setName(composeTicketName(attachedCustomer, newTable, defaultName));
    }
  };

  return (
    <Overlay>
      <Card title="Save ticket" subtitle="Park this order so you can ring up the next customer and come back to it later.">
        {/* Cashier-attached customer summary — read-only confirmation
            that this parked ticket belongs to a specific person.
            Hidden when no customer is attached so the modal stays
            compact for quick walk-in saves. */}
        {attachedCustomer && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 10,
            background: "#FFFBEB", border: "1px solid #FDE68A",
            marginBottom: 12,
          }}>
            <span aria-hidden style={{ fontSize: 18 }}>👤</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#92400E", lineHeight: 1.35 }}>
              <div style={{ fontWeight: 700 }}>
                {attachedCustomer.name || "Customer"}
              </div>
              {attachedCustomer.phone && (
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  📱 {attachedCustomer.phone}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Table picker — always visible in the modal so the cashier
            can assign or change a table without flipping back to the
            cart's order-type segmented control. Empty option lets a
            Dine-in ticket be parked without a table (rare, but the
            backend allows it; useful for "still seating"). */}
        {tables.length > 0 && (
          <Field label="Table">
            <select
              value={selectedTableId ?? ""}
              onChange={(e) => handlePickTable(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "12px 14px", borderRadius: 10,
                border: "1px solid #CBD5E1", fontSize: 14, background: "#fff",
              }}
            >
              <option value="">No table</option>
              {tables.map((t) => {
                const blocked = tableIsInUse(t);
                return (
                  <option key={t.id} value={t.id} disabled={blocked}>
                    {t.name}
                  </option>
                );
              })}
            </select>
            {selectedTableId != null && orderType !== "Dine-in" && (
              <div style={{
                marginTop: 6, fontSize: 11, color: "#92400E",
              }}>
                ⓘ Picking a table switches this ticket to Dine-in.
              </div>
            )}
          </Field>
        )}

        <Field label="Ticket name">
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(""); }}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="e.g. Table 4, Aisha"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: "1px solid #CBD5E1", fontSize: 16, background: "#fff",
            }}
          />
        </Field>
        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. No ice"
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "12px 14px", borderRadius: 10,
              border: "1px solid #CBD5E1", fontSize: 14, background: "#fff",
            }}
          />
        </Field>
        {/* Fire-to-kitchen toggle — chip-style so the cashier can
            see and tap the choice in one motion. Pickup tickets
            default to "Fire now" (phone call → cooking ASAP); other
            types default to "Later" (cashier is parking the cart
            for editing). Cashier can override either way. */}
        <Field label="Send to kitchen?">
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setFireToKitchen(true)}
              aria-pressed={fireToKitchen}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: fireToKitchen ? "2px solid #047857" : "1px solid #CBD5E1",
                background: fireToKitchen ? "#ECFDF5" : "#fff",
                color: fireToKitchen ? "#047857" : "#475569",
                fontWeight: fireToKitchen ? 700 : 600,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1.25,
              }}
            >
              <div>🍳 Fire now</div>
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>
                Kitchen starts cooking
              </div>
            </button>
            <button
              type="button"
              onClick={() => setFireToKitchen(false)}
              aria-pressed={!fireToKitchen}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: !fireToKitchen ? "2px solid #475569" : "1px solid #CBD5E1",
                background: !fireToKitchen ? "#F1F5F9" : "#fff",
                color: !fireToKitchen ? "#1E293B" : "#475569",
                fontWeight: !fireToKitchen ? 700 : 600,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1.25,
              }}
            >
              <div>📋 Save for later</div>
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>
                Park in Open Tickets
              </div>
            </button>
          </div>
        </Field>

        {err && <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "1px solid #CBD5E1", background: "#fff", color: "#475569",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{
            flex: 1, padding: "12px 18px", borderRadius: 10,
            border: "none", background: fireToKitchen ? "#047857" : "#D4813A", color: "#fff",
            fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>{busy ? "Saving…" : fireToKitchen ? "Save & Fire" : "Save ticket"}</button>
        </div>
      </Card>
    </Overlay>
  );
}
