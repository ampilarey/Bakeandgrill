/**
 * Build-your-own platter picker — choice groups with +/- until rules are met.
 */
import type { CSSProperties } from 'react';
import type { PlatterGroup, PlatterSelection } from '@shared/types';
import {
  adjustPlatterSelection,
  countSelectionsForGroup,
  isPlatterChildSelectable,
  resolveGroupCounts,
} from '../utils/platterRules';
import { formatCardPrice } from '../utils/money';

export type PlatterPickerProps = {
  groups: PlatterGroup[];
  selections: PlatterSelection[];
  onChange: (next: PlatterSelection[]) => void;
  variantId?: number | null;
  orderDay?: 'today' | 'tomorrow';
};

export function PlatterPicker({
  groups,
  selections,
  onChange,
  variantId = null,
  orderDay = 'today',
}: PlatterPickerProps) {
  return (
    <div data-testid="platter-picker" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {groups.map((group) => {
        const { min, max } = resolveGroupCounts(group, variantId);
        const have = countSelectionsForGroup(selections, group.id);
        const ruleLabel = max != null && min === max
          ? `Choose ${min}`
          : min != null && max != null
            ? `Choose ${min}–${max}`
            : min != null
              ? `Choose at least ${min}`
              : 'Choose';

        return (
          <div key={group.id} data-testid={`platter-group-${group.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-dark)' }}>
                {group.name}
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {have}{max != null ? ` / ${max}` : ''} · {ruleLabel}
              </p>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.items.map((row) => {
                const child = row.item;
                const selectable = isPlatterChildSelectable(child, orderDay);
                const qty = selections
                  .filter((s) => s.group_id === group.id && s.item_id === row.item_id)
                  .reduce((s, r) => s + r.quantity, 0);
                const atMax = max != null && have >= max;
                const name = child?.name ?? `Item #${row.item_id}`;
                const surcharge = Math.max(0, Number(row.surcharge) || 0);

                return (
                  <li
                    key={row.item_id}
                    data-testid={`platter-child-${row.item_id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0.65rem 0.75rem',
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: selectable ? 'var(--color-surface)' : 'var(--color-surface-alt)',
                      opacity: selectable ? 1 : 0.55,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-dark)' }}>
                        {name}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {!selectable
                          ? (orderDay === 'tomorrow' && child?.tomorrow_remaining === 0
                            ? 'Sold out for tomorrow'
                            : 'Unavailable')
                          : surcharge > 0
                            ? `+${formatCardPrice(surcharge)}`
                            : 'Included'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        data-testid={`platter-dec-${row.item_id}`}
                        disabled={qty <= 0}
                        onClick={() => {
                          const next = adjustPlatterSelection(
                            groups,
                            selections,
                            group.id,
                            row.item_id,
                            -1,
                            variantId,
                          );
                          if (next) onChange(next);
                        }}
                        style={qtyBtn(qty <= 0)}
                        aria-label={`Remove one ${name}`}
                      >
                        −
                      </button>
                      <span
                        data-testid={`platter-qty-${row.item_id}`}
                        style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        data-testid={`platter-inc-${row.item_id}`}
                        disabled={!selectable || atMax}
                        onClick={() => {
                          if (!selectable) return;
                          const next = adjustPlatterSelection(
                            groups,
                            selections,
                            group.id,
                            row.item_id,
                            1,
                            variantId,
                          );
                          if (next) onChange(next);
                        }}
                        style={qtyBtn(!selectable || atMax)}
                        aria-label={`Add one ${name}`}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function qtyBtn(disabled: boolean): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: disabled ? 'var(--color-surface-alt)' : 'var(--color-surface)',
    color: 'var(--color-text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
  };
}
