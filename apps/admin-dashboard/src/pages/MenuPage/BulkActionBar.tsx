import { useState } from 'react';
import type { MenuCategory, MenuGroupRow } from '../../api';
import { Btn } from '../../components/SharedUI';
import type { BulkAction, PriceMode, RoundMode } from './bulkEdit';
import { PACKAGING_MODES, SPICE_LEVELS, TAX_CODES, categoryOptions, menuGroupOptions } from './gridColumns';

/**
 * Everything you can do to a whole selection at once.
 *
 * Owner, 2026-09-01: "add maximum options available". Grouped by the job
 * rather than by the column, because that is how the work arrives — "put the
 * grill up 10% and round it", "these are all exempt now", "hide the whole
 * breakfast menu" — and a flat wall of twenty controls is unusable.
 *
 * Nothing here writes. Every control raises an action for the grid to preview
 * first; a bulk price move is the change nobody can undo by hand.
 */

const PRICE_MODES: Array<{ value: PriceMode; label: string }> = [
  { value: 'set', label: 'Set to' },
  { value: 'increase_pct', label: 'Increase by %' },
  { value: 'decrease_pct', label: 'Decrease by %' },
  { value: 'increase_amount', label: 'Increase by MVR' },
  { value: 'decrease_amount', label: 'Decrease by MVR' },
];

const ROUND_MODES: Array<{ value: RoundMode; label: string }> = [
  { value: 'none', label: 'No rounding' },
  { value: 'whole', label: 'Round to 1.00' },
  { value: 'half', label: 'Round to 0.50' },
  { value: 'five', label: 'Round to 5.00' },
];

type Tab = 'price' | 'organise' | 'availability' | 'stock' | 'kitchen' | 'display';

const TABS: Array<{ key: Tab; label: string; costOnly?: boolean }> = [
  { key: 'price', label: 'Price & cost' },
  { key: 'organise', label: 'Organise' },
  { key: 'availability', label: 'Availability' },
  { key: 'stock', label: 'Stock' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'display', label: 'Display' },
];

const control: React.CSSProperties = {
  padding: '7px 9px', borderRadius: 8, border: '1px solid var(--color-border)',
  fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)',
  color: 'var(--color-text)',
};
const numberControl: React.CSSProperties = { ...control, width: 92, textAlign: 'right' };
const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

export function BulkActionBar({
  selectedCount,
  categories,
  menuGroups,
  canSeeCost,
  applyToSizes,
  onApplyToSizesChange,
  onPropose,
  onClear,
}: {
  selectedCount: number;
  categories: MenuCategory[];
  menuGroups: MenuGroupRow[];
  canSeeCost: boolean;
  applyToSizes: boolean;
  onApplyToSizesChange: (v: boolean) => void;
  onPropose: (action: BulkAction) => void;
  onClear: () => void;
}) {
  const [tab, setTab] = useState<Tab>('price');
  const [priceMode, setPriceMode] = useState<PriceMode>('increase_pct');
  const [priceValue, setPriceValue] = useState('10');
  const [round, setRound] = useState<RoundMode>('none');
  const [costMode, setCostMode] = useState<PriceMode>('increase_pct');
  const [costValue, setCostValue] = useState('5');
  const [margin, setMargin] = useState('60');
  const [stockValue, setStockValue] = useState('0');
  const [thresholdValue, setThresholdValue] = useState('5');
  const [prepValue, setPrepValue] = useState('15');
  const [packagingValue, setPackagingValue] = useState('0');
  const [caloriesValue, setCaloriesValue] = useState('');
  const [capacityValue, setCapacityValue] = useState('');
  const [renumberStep, setRenumberStep] = useState('10');

  if (selectedCount === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }} data-testid="quick-edit-selection">
        Tick rows to change them together.
      </div>
    );
  }

  const field = (
    label: string,
    fieldName: string,
    value: unknown,
    format?: (v: unknown) => string,
  ): BulkAction => ({ kind: 'field', field: fieldName, value, label, format });

  const yesNo = (v: unknown) => (v ? 'yes' : 'no');
  const tabs = TABS.filter((t) => !t.costOnly || canSeeCost);

  return (
    <div data-testid="bulk-actions">
      <div style={{ ...row, marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: 'var(--color-text)' }} data-testid="quick-edit-selection">
          {selectedCount} selected
        </strong>
        <Btn small variant="secondary" onClick={onClear}>Clear</Btn>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <input
            type="checkbox"
            checked={applyToSizes}
            onChange={(e) => onApplyToSizesChange(e.target.checked)}
          />
          {/* On a sized dish the base price is not what anyone is charged. */}
          Apply price changes to sizes too
        </label>
      </div>

      <div className="qe-bulk-tabs" data-testid="bulk-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '7px 14px', fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'price' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={row}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', minWidth: 66 }}>Price</span>
            <select aria-label="Price change" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)} style={control}>
              {PRICE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <input aria-label="Price amount" type="number" min="0" step="0.01" value={priceValue} onChange={(e) => setPriceValue(e.target.value)} style={numberControl} />
            <select aria-label="Rounding" value={round} onChange={(e) => setRound(e.target.value as RoundMode)} style={control}>
              {ROUND_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <Btn small onClick={() => onPropose({ kind: 'price', mode: priceMode, value: parseFloat(priceValue) || 0, round })}>
              Preview price change
            </Btn>
          </div>

          {canSeeCost && (
            <>
              <div style={row}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', minWidth: 66 }}>Cost</span>
                <select aria-label="Cost change" value={costMode} onChange={(e) => setCostMode(e.target.value as PriceMode)} style={control}>
                  {PRICE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input aria-label="Cost amount" type="number" min="0" step="0.01" value={costValue} onChange={(e) => setCostValue(e.target.value)} style={numberControl} />
                <Btn small variant="secondary" onClick={() => onPropose({ kind: 'cost', mode: costMode, value: parseFloat(costValue) || 0, round })}>
                  Preview cost change
                </Btn>
              </div>
              <div style={row}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', minWidth: 66 }}>Margin</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Set price for a target margin of</span>
                <input aria-label="Target margin" type="number" min="0" max="99" step="1" value={margin} onChange={(e) => setMargin(e.target.value)} style={{ ...numberControl, width: 70 }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>%</span>
                <select aria-label="Margin rounding" value={round} onChange={(e) => setRound(e.target.value as RoundMode)} style={control}>
                  {ROUND_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <Btn small variant="secondary" onClick={() => onPropose({ kind: 'margin', marginPct: parseFloat(margin) || 0, round })}>
                  Preview margin pricing
                </Btn>
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                Margin pricing works back from each item&rsquo;s recorded cost. Items with no cost are left alone.
              </p>
            </>
          )}

          <div style={row}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', minWidth: 66 }}>GST</span>
            <select aria-label="Set GST treatment" value="" onChange={(e) => e.target.value && onPropose({ kind: 'tax_code', taxCode: e.target.value })} style={control}>
              <option value="">Set GST…</option>
              {TAX_CODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <span style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Packaging fee</span>
            <input aria-label="Packaging fee" type="number" min="0" step="0.01" value={packagingValue} onChange={(e) => setPackagingValue(e.target.value)} style={numberControl} />
            <Btn small variant="secondary" onClick={() => onPropose(field('Packaging fee', 'packaging_fee', parseFloat(packagingValue) || 0))}>
              Set fee
            </Btn>
            <select aria-label="Packaging mode" value="" onChange={(e) => e.target.value && onPropose(field('Packaging mode', 'packaging_fee_mode', e.target.value))} style={control}>
              <option value="">Packaging mode…</option>
              {PACKAGING_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {tab === 'organise' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={row}>
            <select aria-label="Move to category" value="" onChange={(e) => e.target.value && onPropose({ kind: 'category', categoryId: Number(e.target.value) })} style={control}>
              <option value="">Move to category…</option>
              {categoryOptions(categories).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label="Move to menu group" value="" onChange={(e) => e.target.value && onPropose({ kind: 'menu_group', menuGroupId: Number(e.target.value) })} style={control}>
              <option value="">Move to menu group…</option>
              {menuGroupOptions(menuGroups).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={row}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Renumber the selection in the order shown, in steps of</span>
            <input aria-label="Renumber step" type="number" min="1" step="1" value={renumberStep} onChange={(e) => setRenumberStep(e.target.value)} style={{ ...numberControl, width: 70 }} />
            <Btn small variant="secondary" onClick={() => onPropose({ kind: 'renumber', step: Math.max(1, parseInt(renumberStep, 10) || 10) })}>
              Preview renumber
            </Btn>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
            Renumbering uses the order on screen — sort by a column first to reorder by it.
          </p>
        </div>
      )}

      {tab === 'availability' && (
        <div style={row}>
          {/* The field names here are what the preview dialog shows, so they
              match the grid's column headings rather than the API field. */}
          <Btn small variant="secondary" onClick={() => onPropose(field('Selling today', 'is_available', true, yesNo))}>Mark selling today</Btn>
          <Btn small variant="secondary" onClick={() => onPropose(field('Selling today', 'is_available', false, yesNo))}>Mark sold out</Btn>
          <span style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <Btn small variant="secondary" onClick={() => onPropose(field('On menu', 'is_active', true, yesNo))}>Show on menu</Btn>
          <Btn small variant="secondary" onClick={() => onPropose(field('On menu', 'is_active', false, yesNo))}>Hide from menu</Btn>
          <span style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <Btn small variant="secondary" onClick={() => onPropose(field('Pre-order', 'allow_pre_order', true, yesNo))}>Allow pre-order</Btn>
          <Btn small variant="secondary" onClick={() => onPropose(field('Pre-order', 'allow_pre_order', false, yesNo))}>No pre-order</Btn>
        </div>
      )}

      {tab === 'stock' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={row}>
            <Btn small variant="secondary" onClick={() => onPropose(field('Track stock', 'track_stock', true, yesNo))}>Track stock</Btn>
            <Btn small variant="secondary" onClick={() => onPropose(field('Track stock', 'track_stock', false, yesNo))}>Stop tracking</Btn>
          </div>
          <div style={row}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Set stock to</span>
            <input aria-label="Stock quantity" type="number" min="0" step="1" value={stockValue} onChange={(e) => setStockValue(e.target.value)} style={numberControl} />
            <Btn small variant="secondary" onClick={() => onPropose(field('Stock', 'stock_quantity', Math.max(0, parseInt(stockValue, 10) || 0)))}>
              Set stock
            </Btn>
            <span style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Low-stock alert at</span>
            <input aria-label="Low stock threshold" type="number" min="0" step="1" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} style={numberControl} />
            <Btn small variant="secondary" onClick={() => onPropose(field('Alert at', 'low_stock_threshold', Math.max(0, parseInt(thresholdValue, 10) || 0)))}>
              Set threshold
            </Btn>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
            Turning tracking on also switches the item to stock-based availability, so the count actually gates sales.
          </p>
        </div>
      )}

      {tab === 'kitchen' && (
        <div style={row}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Prep time</span>
          <input aria-label="Prep time" type="number" min="0" max="480" step="1" value={prepValue} onChange={(e) => setPrepValue(e.target.value)} style={numberControl} />
          <Btn small variant="secondary" onClick={() => onPropose(field('Prep min', 'prep_time_minutes', Math.max(0, parseInt(prepValue, 10) || 0)))}>Set prep time</Btn>
          <select aria-label="Set spice level" value="" onChange={(e) => e.target.value && onPropose(field('Spice', 'spice_level', e.target.value))} style={control}>
            <option value="">Spice level…</option>
            {SPICE_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Calories</span>
          <input aria-label="Calories" type="number" min="0" step="1" value={caloriesValue} onChange={(e) => setCaloriesValue(e.target.value)} style={numberControl} />
          <Btn small variant="secondary" onClick={() => onPropose(field('Calories', 'calories', caloriesValue === '' ? null : Math.max(0, parseInt(caloriesValue, 10) || 0)))}>Set calories</Btn>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Tomorrow cap</span>
          <input aria-label="Tomorrow capacity" type="number" min="1" step="1" value={capacityValue} onChange={(e) => setCapacityValue(e.target.value)} style={numberControl} />
          <Btn small variant="secondary" onClick={() => onPropose(field('Tomorrow cap', 'tomorrow_daily_capacity', capacityValue === '' ? null : Math.max(1, parseInt(capacityValue, 10) || 1)))}>Set cap</Btn>
        </div>
      )}

      {tab === 'display' && (
        <div style={row}>
          <Btn small variant="secondary" onClick={() => onPropose(field('On signage', 'show_on_signage', true, yesNo))}>Show on signage</Btn>
          <Btn small variant="secondary" onClick={() => onPropose(field('On signage', 'show_on_signage', false, yesNo))}>Hide from signage</Btn>
          <span style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <Btn small variant="secondary" onClick={() => onPropose(field('Promoted', 'is_signage_promoted', true, yesNo))}>Promote on signage</Btn>
          <Btn small variant="secondary" onClick={() => onPropose(field('Promoted', 'is_signage_promoted', false, yesNo))}>Stop promoting</Btn>
          <span style={{ width: 1, height: 24, background: 'var(--color-border)' }} />
          <Btn small variant="secondary" onClick={() => onPropose(field('Price note', 'price_note', null, (v) => String(v ?? '—')))}>Clear price note</Btn>
        </div>
      )}
    </div>
  );
}
