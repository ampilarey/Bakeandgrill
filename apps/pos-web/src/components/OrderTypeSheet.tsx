import { useState, type CSSProperties } from "react";
import { Overlay } from "./OpenShiftModal";
import { z } from "../theme";
import type { RestaurantTable } from "../types";
import { POS_ORDER_TYPES, type PosOrderType } from "../orderTypes";
import { orderTypeTone } from "../orderTypeLabels";
import { freeStands, isStand, lowestFreeStand, realTables, tableIsInUse } from "../utils/tableLabels";

type Props = {
  /** "type": dine-in or takeaway first (then the table for dine-in); "table": the table alone. */
  mode: "type" | "table";
  /** The types this person may ring (Admin → Staff); never more than those. */
  types: PosOrderType[];
  tables: RestaurantTable[];
  /** A resumed ticket's own table stays pickable. */
  ourOrderId?: number | null;
  /** The dish the cashier tapped, named in the title. */
  itemName?: string | null;
  /**
   * The number the till picked for this ticket (table mode, before payment):
   * the sheet asks the cashier to keep it or choose another.
   */
  autoTableId?: number | null;
  /** `auto` is true when the till picked the number itself (a free stand), not the cashier. */
  onChoose: (type: PosOrderType, tableId: number | null, auto?: boolean) => void;
  onCancel: () => void;
};

const HINT: Record<PosOrderType, string> = {
  "Dine-in": "Eats here",
  Takeaway: "To go",
  Pickup: "Collects later",
  Delivery: "Delivered",
};

function toneVars(type: PosOrderType): CSSProperties {
  const tone = orderTypeTone(type);
  return {
    "--tone-solid": tone.solid,
    "--tone-tint": tone.tint,
    "--tone-border": tone.border,
    "--tone-ink": tone.ink,
  } as CSSProperties;
}

/**
 * The question a new ticket asks before its first item (owner, 2026-10-21:
 * "when new order is entered by clicking any items, a pop up appears to
 * select dine in or takeaway. If its dine in to select free available
 * table"). Dine-in and Takeaway are the big tiles; Pickup and Delivery sit
 * under them, smaller, and only for a person allowed to ring them.
 *
 * Number stands (owner, 2026-10-22: "here people sit on their own … assign
 * a virtual table … automatically assigned a random number"): with a free
 * number, Dine-in takes the lowest one at once and the sheet closes; the
 * cashier changes it from the cart or at Charge, where the same sheet, in
 * table mode with `autoTableId`, asks them to keep the number or choose
 * another, so the customer is told before paying. With no stands, Dine-in
 * goes on to the tables: the free ones bright, the ones in use dark grey
 * with the ticket they hold, and "Not seated yet" for a customer who orders
 * at the counter and sits down after.
 */
export function OrderTypeSheet({ mode, types, tables, ourOrderId = null, itemName = null, autoTableId = null, onChoose, onCancel }: Props) {
  const [step, setStep] = useState<"type" | "table">(mode);
  const ordered = POS_ORDER_TYPES.filter((t) => types.includes(t));
  const bigOnes = ordered.filter((t) => t === "Dine-in" || t === "Takeaway");
  const allBig = bigOnes.length === 0;
  const floor = realTables(tables);
  const stands = freeStands(tables);
  const autoTable = autoTableId != null ? tables.find((t) => t.id === autoTableId) ?? null : null;
  // The picked number is offered even while this very ticket holds it.
  const numbers = autoTable && isStand(autoTable) && !stands.some((t) => t.id === autoTable.id) ? [autoTable, ...stands] : stands;
  // A dine-in ticket is paid with a seat on it (owner, 2026-10-22: "still
  // without selecting table also can complete the payment"): at Charge, "No
  // table" is offered only when every table and number is in use.
  const anyFree = numbers.length > 0 || floor.some((t) => {
    const ours = ourOrderId != null && t.current_order_id === ourOrderId;
    return ours || (!tableIsInUse(t) && t.status !== "reserved" && t.status !== "closed");
  });
  const withoutSeat = mode === "table" && anyFree ? null : (mode === "table" ? "Everything is in use: pay without" : "Not seated yet");

  const pickType = (type: PosOrderType) => {
    if (type === "Dine-in") {
      const stand = lowestFreeStand(tables);
      if (stand) { onChoose("Dine-in", stand.id, true); return; }
      if (floor.length > 0) { setStep("table"); return; }
    }
    onChoose(type, null);
  };

  const title = step === "table"
    ? (autoTable ? `${autoTable.name} was picked for them` : "Which table?")
    : bigOnes.length === 2 && ordered.length === 2
      ? "Dine-in or takeaway?"
      : "What kind of order?";
  const subtitle = step === "table"
    ? (autoTable
      ? "Tell them the number, or choose a table or another number."
      : numbers.length > 0
        ? "Free tables are bright. Tap one, or give them a number."
        : "Free tables are bright. Tap one, or Not seated yet.")
    : itemName
      ? `Adding ${itemName}. The price and the kitchen slip follow this.`
      : "The price and the kitchen slip follow this.";

  return (
    <Overlay onEscape={onCancel} zIndex={z.overlay}>
      <div className="pos-type-sheet" data-testid="order-type-sheet" aria-label={title}>
        <div className="pos-type-sheet__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="pos-type-sheet__title">{title}</h2>
            <p className="pos-type-sheet__sub">{subtitle}</p>
          </div>
          <button type="button" className="pos-type-sheet__close" onClick={onCancel} aria-label="Close">×</button>
        </div>

        {step === "type" && (
          <div className="pos-type-sheet__types">
            {ordered.map((t) => {
              const big = allBig || t === "Dine-in" || t === "Takeaway";
              const hint = t === "Dine-in" && stands.length > 0 ? "Eats here · gets a number" : HINT[t];
              return (
                <button
                  key={t}
                  type="button"
                  data-order-type={orderTypeTone(t).key}
                  className={`pos-type-btn${big ? "" : " pos-type-btn--small"}`}
                  style={toneVars(t)}
                  onClick={() => pickType(t)}
                >
                  <span className="pos-type-btn__dot" aria-hidden="true" />
                  <span>{t}</span>
                  <span className="pos-type-btn__hint">{hint}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === "table" && (
          <>
            {floor.length > 0 && (
              <div className="pos-type-sheet__tables" role="group" aria-label="Tables">
                {floor.map((t) => {
                  const ours = ourOrderId != null && t.current_order_id === ourOrderId;
                  const inUse = tableIsInUse(t) && !ours;
                  const closed = !inUse && !ours && (t.status === "reserved" || t.status === "closed");
                  const note = ours
                    ? "This ticket"
                    : inUse
                      ? `In use · ${t.current_order_label || t.current_order_number || "open"}`
                      : t.status === "reserved"
                        ? "Reserved"
                        : t.status === "closed"
                          ? "Closed"
                          : null;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`pos-table-tile${ours ? " pos-table-tile--ours" : ""}`}
                      disabled={inUse || closed}
                      aria-label={note ? `${t.name}, ${note}` : t.name}
                      onClick={() => onChoose("Dine-in", t.id)}
                    >
                      <span>{t.name}</span>
                      {note && <span className="pos-table-tile__note">{note}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {numbers.length > 0 && (
              <>
                <p className="pos-type-sheet__group">Numbers</p>
                <div className="pos-type-sheet__tables" role="group" aria-label="Numbers">
                  {numbers.map((t) => {
                    const picked = autoTable?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`pos-table-tile pos-table-tile--stand${picked ? " pos-table-tile--ours" : ""}`}
                        aria-label={picked ? `${t.name}, Picked for them` : t.name}
                        onClick={() => onChoose("Dine-in", t.id, false)}
                      >
                        <span>{t.name}</span>
                        {picked && <span className="pos-table-tile__note">Picked for them</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="pos-type-sheet__actions">
              {mode === "type" && (
                <button type="button" className="pos-type-sheet__secondary" onClick={() => setStep("type")}>
                  Back
                </button>
              )}
              {autoTable ? (
                <button type="button" className="pos-type-sheet__primary" onClick={() => onChoose("Dine-in", autoTable.id, false)}>
                  Keep {autoTable.name}
                </button>
              ) : withoutSeat ? (
                <button type="button" className="pos-type-sheet__secondary" onClick={() => onChoose("Dine-in", null)}>
                  {withoutSeat}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
