import { useEffect, useMemo, useState } from 'react';
import {
  fetchInventoryItems, saveItemRecipe,
  type InventoryItem, type ItemWithRecipe,
} from '../../api';
import { Btn, Modal, ModalActions, Spinner } from '../../components/SharedUI';

interface Row {
  key: string;
  inventory_item_id: number | '';
  quantity: string;
  unit: string;
  /**
   * '' = every size shares this row (scaled by the size's "Uses" factor).
   * A variant id = this size's own row, taken exactly as written. Owner,
   * 2026-09-07: a 1.5L bottle for the 1.5L size, a 500ml for the 500ml.
   */
  variant_id: number | '';
}

let _rowSeq = 0;
const newRow = (): Row => ({ key: `r${_rowSeq++}`, inventory_item_id: '', quantity: '', unit: '', variant_id: '' });

function rowsFromItem(item: ItemWithRecipe): Row[] {
  const ings = item.recipe?.ingredients ?? [];
  if (ings.length === 0) return [newRow()];
  return ings.map((ing) => ({
    key: `r${_rowSeq++}`,
    inventory_item_id: ing.inventory_item_id,
    quantity: String(ing.quantity),
    unit: ing.unit ?? ing.inventory_item?.unit ?? '',
    variant_id: ing.variant_id ?? '',
  }));
}

const money = (n: number | null | undefined): string =>
  n == null ? '—' : `MVR ${Number(n).toFixed(2)}`;

/**
 * Recipe recorder + live profit calculator. Owner-only (the parent gates the
 * entry point on recipes.manage). Editing replaces the whole ingredient list;
 * cost, profit and margin recompute live against inventory unit costs so the
 * owner sees the effect of a change before saving.
 */
export function RecipeEditorModal({
  item, onClose, onSaved,
}: {
  item: ItemWithRecipe;
  onClose: () => void;
  onSaved: (updated: ItemWithRecipe) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromItem(item));
  const [options, setOptions] = useState<InventoryItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [limitsAvailability, setLimitsAvailability] = useState(
    () => item.recipe?.limits_availability ?? false,
  );
  // When these ingredients leave the store: as the dish sells (the default),
  // or when the kitchen records a production batch of it. One or the other —
  // never both, so the flour is not taken twice (2026-09-07 audit).
  const [consumedAt, setConsumedAt] = useState<'sale' | 'production'>(
    () => item.recipe?.consumed_at ?? 'sale',
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Gather active inventory items for the picker (bounded page walk).
        const all: InventoryItem[] = [];
        let page = 1;
        for (;;) {
          const res = await fetchInventoryItems({ page });
          all.push(...res.data);
          if (page >= (res.meta?.last_page ?? 1) || page >= 20) break;
          page += 1;
        }
        if (alive) setOptions(all.filter((o) => o.is_active));
      } catch (e) {
        if (alive) { setError((e as Error).message); setOptions([]); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const costOf = useMemo(() => {
    const map = new Map<number, number>();
    (options ?? []).forEach((o) => map.set(o.id, o.cost_per_unit ?? 0));
    return map;
  }, [options]);

  const unitOf = useMemo(() => {
    const map = new Map<number, string>();
    (options ?? []).forEach((o) => map.set(o.id, o.unit));
    return map;
  }, [options]);

  const sizes = item.variants ?? [];
  const hasSizes = sizes.length > 0;
  const rowCost = (r: Row) => {
    const id = typeof r.inventory_item_id === 'number' ? r.inventory_item_id : 0;
    const qty = parseFloat(r.quantity);
    return id && qty > 0 ? qty * (costOf.get(id) ?? 0) : 0;
  };
  const price = Number(item.base_price) || 0;
  // The dish as a whole only knows what every size shares.
  const recipeCost = rows.filter((r) => r.variant_id === '').reduce((sum, r) => sum + rowCost(r), 0);
  // Each size: its share of the shared rows, plus what is its alone.
  const sizeCosts = sizes.map((v) => ({
    ...v,
    cost: recipeCost * v.consumption_factor + rows.filter((r) => r.variant_id === v.id).reduce((sum, r) => sum + rowCost(r), 0),
    price: item.variant_costs?.find((c) => c.variant_id === v.id)?.price ?? price,
  }));
  const hasAny = rows.some((r) => typeof r.inventory_item_id === 'number' && parseFloat(r.quantity) > 0);
  const profit = hasAny ? price - recipeCost : null;
  const marginPct = hasAny && price > 0 ? (profit! / price) * 100 : null;

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const ingredients = rows
        .filter((r) => typeof r.inventory_item_id === 'number' && parseFloat(r.quantity) > 0)
        .map((r) => ({
          inventory_item_id: r.inventory_item_id as number,
          quantity: parseFloat(r.quantity),
          unit: r.unit || null,
          variant_id: r.variant_id === '' ? null : r.variant_id,
        }));
      const res = await saveItemRecipe(item.id, ingredients, limitsAvailability, consumedAt);
      onSaved(res.item);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--color-text-muted)',
  };
  const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' };
  const control: React.CSSProperties = {
    width: '100%', minHeight: 38, padding: '0 8px',
    border: '1.5px solid var(--color-border)', borderRadius: 8,
    fontSize: 13, background: 'var(--color-surface)', color: 'var(--color-text)',
    fontFamily: 'inherit', outline: 'none',
  };

  return (
    <Modal
      title={`Recipe & cost — ${item.name}`}
      onClose={onClose}
      maxWidth={620}
      footer={(
        <ModalActions>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving || options === null}>
            {saving ? 'Saving…' : 'Save recipe'}
          </Btn>
        </ModalActions>
      )}
    >
      {options === null ? (
        <div style={{ padding: '30px 0', textAlign: 'center' }}><Spinner /></div>
      ) : (
        <>
          {error && (
            <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Ingredient</th>
              {hasSizes && <th style={{ ...th, width: 120 }}>For size</th>}
              <th style={{ ...th, width: 90 }}>Qty</th>
              <th style={{ ...th, width: 70 }}>Unit</th>
              <th style={{ ...th, width: 90, textAlign: 'right' }}>Line cost</th>
              <th style={{ ...th, width: 34 }} aria-label="Remove" />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const id = typeof r.inventory_item_id === 'number' ? r.inventory_item_id : 0;
                const qty = parseFloat(r.quantity);
                const lineCost = id && qty > 0 ? qty * (costOf.get(id) ?? 0) : 0;
                return (
                  <tr key={r.key}>
                    <td style={td}>
                      <select
                        value={r.inventory_item_id}
                        onChange={(e) => {
                          const v = e.target.value ? Number(e.target.value) : '';
                          setRow(r.key, {
                            inventory_item_id: v,
                            unit: typeof v === 'number' ? (unitOf.get(v) ?? r.unit) : r.unit,
                          });
                        }}
                        style={{ ...control, cursor: 'pointer' }}
                      >
                        <option value="">Select ingredient…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}{o.cost_per_unit != null ? ` (MVR ${o.cost_per_unit.toFixed(2)}/${o.unit})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    {hasSizes && (
                      <td style={td}>
                        <select
                          aria-label="Which size this row is for"
                          value={r.variant_id}
                          onChange={(e) => setRow(r.key, { variant_id: e.target.value ? Number(e.target.value) : '' })}
                          title="All sizes: shared, scaled by each size's Uses factor. One size: taken exactly as written, only when that size sells."
                          style={{ ...control, cursor: 'pointer' }}
                        >
                          <option value="">All sizes</option>
                          {sizes.map((v) => <option key={v.id} value={v.id}>{v.name} only</option>)}
                        </select>
                      </td>
                    )}
                    <td style={td}>
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        value={r.quantity}
                        onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                        style={control}
                      />
                    </td>
                    <td style={td}>
                      <input
                        value={r.unit}
                        onChange={(e) => setRow(r.key, { unit: e.target.value })}
                        placeholder={id ? unitOf.get(id) ?? '' : ''}
                        style={control}
                      />
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {money(lineCost)}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={() => removeRow(r.key)}
                        title="Remove ingredient"
                        aria-label="Remove ingredient"
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          color: 'var(--color-text-muted)', fontSize: 18, lineHeight: 1, padding: 4,
                        }}
                      >×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 10 }}>
            <Btn small variant="secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
              + Add ingredient
            </Btn>
          </div>

          {/* Live cost / margin / profit summary. */}
          <div style={{
            marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 10, padding: 14, borderRadius: 12,
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
          }}>
            <Stat label="Selling price" value={money(price)} />
            <Stat label="Recipe cost" value={money(hasAny ? recipeCost : null)} />
            <Stat
              label="Profit / unit"
              value={money(profit)}
              color={profit != null && profit < 0 ? 'var(--color-danger)' : 'var(--color-success)'}
            />
            <Stat
              label="Margin"
              value={marginPct == null ? '—' : `${marginPct.toFixed(1)}%`}
              color={marginPct != null && marginPct < 0 ? 'var(--color-danger)' : undefined}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '10px 0 0' }}>
            Cost rolls up live from inventory unit prices — a later price change moves the margin
            without re-saving. Profit is the selling price less this cost.
            {hasSizes ? ' Rows marked "All sizes" are the recipe cost above; each size adds its own rows below.' : ''}
          </p>

          {hasSizes && (
            <div data-testid="recipe-size-costs" style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>
                  <th style={th}>Size</th>
                  <th style={{ ...th, textAlign: 'right' }}>Price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cost</th>
                  <th style={{ ...th, textAlign: 'right' }}>Profit</th>
                  <th style={{ ...th, textAlign: 'right' }}>Margin</th>
                </tr></thead>
                <tbody>
                  {sizeCosts.map((v) => {
                    const p = v.price - v.cost;
                    return (
                      <tr key={v.id} data-testid={`recipe-size-cost-${v.id}`}>
                        <td style={td}>{v.name}{v.consumption_factor !== 1 ? <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}> · uses {v.consumption_factor}</span> : null}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(v.price)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(v.cost)}</td>
                        <td style={{ ...td, textAlign: 'right', color: p < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{money(p)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{v.price > 0 ? `${((p / v.price) * 100).toFixed(1)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
              These ingredients leave stock when…
            </p>
            {([
              ['sale', 'the dish is sold', 'Made to order. Every sale, bundle, catering order and wholesale delivery takes its share.'],
              ['production', 'the kitchen records making it', 'Baked ahead and counted as prepared stock. A production batch takes the ingredients; sales take the finished count.'],
            ] as const).map(([value, label, hint]) => (
              <label key={value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="recipe-consumed-at"
                  value={value}
                  checked={consumedAt === value}
                  onChange={() => setConsumedAt(value)}
                  data-testid={`recipe-consumed-${value}`}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{hint}</span>
                </span>
              </label>
            ))}
          </div>

          {/* Off by default: an ingredient count nobody keeps current must not
              take an item off the menu on its own. */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: 12,
            borderRadius: 10, border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={limitsAvailability}
              onChange={(e) => setLimitsAvailability(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                Stop selling when these ingredients run out
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                Rows for all sizes are one shared pool, each size taking its own share (see <strong>Uses</strong> on
                the variants tab); a row for one size is that size's own stock. A size stays on the menu while its
                ingredients cover it, so a full portion is offered down to the last whole piece. Leave off if the
                ingredient counts are not kept current.
              </span>
            </span>
          </label>
        </>
      )}
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}
