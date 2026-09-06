/**
 * Build-your-own platter picker for the till.
 *
 * Owner's audit, 2026-09-06, F2: the POS order payload had no `children`
 * field and pos-web had no picker — there was no mention of platters in the
 * till app at all. A platter looked like any other item, so a cashier could
 * tap it and take money; on submit the server refused the order with "Choose
 * items for X before ordering", an error the cashier could do nothing about.
 * Platters were effectively online-and-catering only, which nothing in the
 * interface said.
 *
 * The rules come from `@shared/utils`, the same ones the customer's picker
 * uses, so the count a cashier is held to is the count the customer sees. The
 * server validates every pick again regardless and reads each surcharge from
 * the definition, never from what this sends.
 */
import type { CSSProperties } from "react";
import type { PlatterGroup, PlatterSelection } from "../types";
import { childDisplayName, selectionMatchesRow } from "@shared/types";
import {
  adjustPlatterSelection,
  countSelectionsForGroup,
  resolveGroupCounts,
} from "@shared/utils";

export type PosPlatterPickerProps = {
  groups: PlatterGroup[];
  selections: PlatterSelection[];
  onChange: (next: PlatterSelection[]) => void;
  /** Sizes can require a different number of picks — see `size_counts`. */
  variantId?: number | null;
};

const stepBtn = (enabled: boolean): CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: 10,
  border: "1px solid #CBD5E1",
  background: enabled ? "#FFFFFF" : "#F1F5F9",
  color: enabled ? "#0F172A" : "#94A3B8",
  fontSize: 20,
  fontWeight: 700,
  lineHeight: 1,
  cursor: enabled ? "pointer" : "not-allowed",
  flexShrink: 0,
});

export function PosPlatterPicker({
  groups,
  selections,
  onChange,
  variantId = null,
}: PosPlatterPickerProps) {
  return (
    <div data-testid="pos-platter-picker" style={{ display: "grid", gap: 16 }}>
      {groups.map((group) => {
        const { min, max } = resolveGroupCounts(group, variantId);
        const have = countSelectionsForGroup(selections, group.id);
        const ruleLabel = max != null && min === max
          ? `Choose ${min}`
          : min != null && max != null
            ? `Choose ${min}–${max}`
            : min != null
              ? `Choose at least ${min}`
              : "Choose";
        const short = min != null && have < min;

        return (
          <div key={group.id} data-testid={`pos-platter-group-${group.id}`}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", gap: 8, marginBottom: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                {group.name}
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
                // The one number a cashier under pressure needs: how many
                // more, and whether they are done.
                color: short ? "#B45309" : "#047857",
              }}>
                {have}{max != null ? ` / ${max}` : ""} · {ruleLabel}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {group.items.map((row) => {
                const child = row.item;
                // "Coke (Large)": the size is part of what is being picked.
                const name = childDisplayName(child?.name, row.variant, row.item_id);
                const rowKey = `${row.item_id}:${row.variant_id ?? 0}`;
                // Sold out is the till's own version of the customer's
                // availability gate: a cashier looking at the counter can
                // still see it, so it is greyed rather than hidden.
                const soldOut = child?.is_available === false;
                const qty = selections
                  .filter((s) => s.group_id === group.id && selectionMatchesRow(s, row))
                  .reduce((sum, s) => sum + s.quantity, 0);
                const atMax = max != null && have >= max;
                const surcharge = Math.max(0, Number(row.surcharge) || 0);

                const step = (delta: number) => {
                  const next = adjustPlatterSelection(
                    groups, selections, group.id, row.item_id, delta, variantId, row.variant_id ?? null,
                  );
                  if (next) onChange(next);
                };

                return (
                  <div
                    key={rowKey}
                    data-testid={`pos-platter-choice-${row.item_id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 12,
                      border: `1px solid ${qty > 0 ? "#0F766E" : "#E2E8F0"}`,
                      background: qty > 0 ? "#F0FDFA" : "#FFFFFF",
                      opacity: soldOut ? 0.5 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>
                        {name}
                      </div>
                      {(surcharge > 0 || soldOut) && (
                        <div style={{ fontSize: 12, color: soldOut ? "#B91C1C" : "#64748B" }}>
                          {soldOut ? "Sold out" : `+MVR ${surcharge.toFixed(2)}`}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove one ${name}`}
                      disabled={qty <= 0}
                      onClick={() => step(-1)}
                      style={stepBtn(qty > 0)}
                    >−</button>
                    <div style={{
                      minWidth: 24, textAlign: "center",
                      fontSize: 16, fontWeight: 700, color: "#0F172A",
                    }}>
                      {qty}
                    </div>
                    <button
                      type="button"
                      aria-label={`Add one ${name}`}
                      disabled={soldOut || atMax}
                      onClick={() => step(1)}
                      style={stepBtn(!soldOut && !atMax)}
                    >+</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
