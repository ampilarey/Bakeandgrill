import { useState, type CSSProperties } from "react";
import { Overlay } from "./OpenShiftModal";
import { z } from "../theme";
import type { RestaurantTable } from "../types";
import { POS_ORDER_TYPES, type PosOrderType } from "../orderTypes";
import { orderTypeTone } from "../orderTypeLabels";
import { tableIsInUse } from "../utils/tableLabels";

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
  onChoose: (type: PosOrderType, tableId: number | null) => void;
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
 * under them, smaller, and only for a person allowed to ring them. Dine-in
 * goes on to the tables: the free ones bright, the ones in use greyed with
 * the ticket they hold, and "Not seated yet" for a customer who orders at
 * the counter and sits down after. The same sheet, in table mode, is the
 * reminder at Save and Charge for a dine-in ticket with no table.
 */
export function OrderTypeSheet({ mode, types, tables, ourOrderId = null, itemName = null, onChoose, onCancel }: Props) {
  const [step, setStep] = useState<"type" | "table">(mode);
  const ordered = POS_ORDER_TYPES.filter((t) => types.includes(t));
  const bigOnes = ordered.filter((t) => t === "Dine-in" || t === "Takeaway");
  const allBig = bigOnes.length === 0;
  const hasTables = tables.length > 0;

  const pickType = (type: PosOrderType) => {
    if (type === "Dine-in" && hasTables) { setStep("table"); return; }
    onChoose(type, null);
  };

  const title = step === "table"
    ? "Which table?"
    : bigOnes.length === 2 && ordered.length === 2
      ? "Dine-in or takeaway?"
      : "What kind of order?";
  const subtitle = step === "table"
    ? "Free tables are bright. Tap one, or Not seated yet."
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
                  <span className="pos-type-btn__hint">{HINT[t]}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === "table" && (
          <>
            <div className="pos-type-sheet__tables" role="group" aria-label="Tables">
              {tables.map((t) => {
                const ours = ourOrderId != null && t.current_order_id === ourOrderId;
                const inUse = tableIsInUse(t) && !ours;
                const closed = !inUse && !ours && (t.status === "reserved" || t.status === "closed");
                const note = ours
                  ? "This ticket"
                  : inUse
                    ? (t.current_order_label || t.current_order_number || "In use")
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
            <div className="pos-type-sheet__actions">
              {mode === "type" && (
                <button type="button" className="pos-type-sheet__secondary" onClick={() => setStep("type")}>
                  Back
                </button>
              )}
              <button type="button" className="pos-type-sheet__secondary" onClick={() => onChoose("Dine-in", null)}>
                {mode === "table" ? "No table" : "Not seated yet"}
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
