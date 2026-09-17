import { useEffect, useMemo, useState } from 'react';
import {
  fetchInventoryItems, getUnitConversions, saveItemRecipe,
  type InventoryItem, type ItemWithRecipe, type UnitConversion,
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
  /** The ingredient this row named has been deleted from inventory. */
  missing?: boolean;
}

let _rowSeq = 0;
const newRow = (): Row => ({ key: `r${_rowSeq++}`, inventory_item_id: '', quantity: '', unit: '', variant_id: '' });

function rowsFromItem(item: ItemWithRecipe): Row[] {
  const ings = item.recipe?.ingredients ?? [];
  if (ings.length === 0) return [newRow()];
  return ings.map((ing) => ({
    key: `r${_rowSeq++}`,
    inventory_item_id: ing.inventory_item_id ?? '',
    quantity: String(ing.quantity),
    unit: ing.unit ?? ing.inventory_item?.unit ?? '',
    variant_id: ing.variant_id ?? '',
    missing: ing.missing_ingredient === true || (ing.inventory_item == null && ing.inventory_item_id == null),
  }));
}

const money = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? '—' : `MVR ${Number(n).toFixed(2)}`;

const norm = (u: string) => u.trim().toLowerCase();

/**
 * How many of `to` one `from` is, from the conversions on file — either
 * direction — or null when the pair has none. The same answer the server
 * gives, so the preview and the saved cost agree.
 */
export function unitFactor(conversions: UnitConversion[], from: string, to: string): number | null {
  const f = norm(from);
  const t = norm(to);
  if (f === '' || t === '' || f === t) return 1;
  const direct = conversions.find((c) => norm(c.from_unit) === f && norm(c.to_unit) === t);
  if (direct && direct.factor > 0) return direct.factor;
  const reverse = conversions.find((c) => norm(c.from_unit) === t && norm(c.to_unit) === f);
  if (reverse && reverse.factor > 0) return 1 / reverse.factor;
  return null;
}

/** The units a row for an ingredient stocked in `stockUnit` may be written in. */
export function unitChoices(conversions: UnitConversion[], stockUnit: string): string[] {
  const out: string[] = [];
  const add = (u: string) => { const n = norm(u); if (n && !out.includes(n)) out.push(n); };
  add(stockUnit);
  for (const c of conversions) {
    if (norm(c.from_unit) === norm(stockUnit)) add(c.to_unit);
    if (norm(c.to_unit) === norm(stockUnit)) add(c.from_unit);
  }
  return out;
}

/**
 * Recipe recorder + live profit calculator. Owner-only (the parent gates the
 * entry point on recipes.manage). Editing replaces the whole ingredient list;
 * cost, profit and margin recompute live against inventory unit costs so the
 * owner sees the effect of a change before saving.
 *
 * Audit, 2026-09-17: the preview multiplied the row's quantity by the
 * ingredient's price without converting units (200 g of per-kilo flour read
 * as 200 kilos), ignored the yield, offered any text as a unit, and said
 * nothing when a typed cost on the item was overriding the whole recipe or
 * when an ingredient had been deleted underneath a row.
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
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
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
  // How many the rows make. One by default: the rows are for one dish.
  const [yieldQty, setYieldQty] = useState(() => String(item.recipe?.yield_quantity ?? 1));

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
    // The conversions decide which units a row may use and what it costs.
    // Without them only the ingredient's own unit is offered, which is
    // always right, so a failure here narrows the choice rather than the
    // arithmetic.
    getUnitConversions()
      .then((r) => { if (alive) setConversions(r.conversions ?? []); })
      .catch(() => { if (alive) setConversions([]); });
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
  const yieldNum = Math.max(1, parseFloat(yieldQty) || 1);

  /** A row's cost in the ingredient's money; null when it cannot be costed. */
  const rowCost = (r: Row): number | null => {
    // A row whose ingredient is gone is unknown, not free, whatever else it says.
    if (r.missing) return null;
    const id = typeof r.inventory_item_id === 'number' ? r.inventory_item_id : 0;
    const qty = parseFloat(r.quantity);
    if (!id || !(qty > 0)) return 0;
    const factor = unitFactor(conversions, r.unit || (unitOf.get(id) ?? ''), unitOf.get(id) ?? '');
    if (factor === null) return null;
    return (qty * factor * (costOf.get(id) ?? 0)) / yieldNum;
  };
  const sumRows = (list: Row[]): number | null => {
    let sum = 0;
    for (const r of list) {
      const c = rowCost(r);
      if (c === null) return null;
      sum += c;
    }
    return sum;
  };
  const price = Number(item.base_price) || 0;
  // The dish as a whole only knows what every size shares.
  const recipeCost = sumRows(rows.filter((r) => r.variant_id === ''));
  // Each size: its share of the shared rows, plus what is its alone.
  const sizeCosts = sizes.map((v) => {
    const own = sumRows(rows.filter((r) => r.variant_id === v.id));
    return {
      ...v,
      cost: recipeCost === null || own === null ? null : recipeCost * v.consumption_factor + own,
      price: item.variant_costs?.find((c) => c.variant_id === v.id)?.price ?? price,
    };
  });
  const hasAny = rows.some((r) => typeof r.inventory_item_id === 'number' && parseFloat(r.quantity) > 0);
  const profit = hasAny && recipeCost !== null ? price - recipeCost : null;
  const marginPct = profit !== null && price > 0 ? (profit / price) * 100 : null;
  const unknownRows = rows.filter((r) => r.missing || (typeof r.inventory_item_id === 'number' && parseFloat(r.quantity) > 0 && rowCost(r) === null));

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]));

  const handleSave = async () => {
    if (rows.some((r) => r.missing)) {
      setError('An ingredient on this recipe has been deleted. Pick a replacement for that row, or remove it.');
      return;
    }
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
      const res = await saveItemRecipe(item.id, ingredients, limitsAvailability, consumedAt, yieldNum);
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
  const notice: React.CSSProperties = {
    margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
    background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--color-warning)', color: 'var(--color-text)',
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

          {item.manual_cost != null && (
            <p style={notice} data-testid="recipe-manual-cost-notice">
              This item has a cost of <strong>{money(item.manual_cost)}</strong> typed on it, and that is what the
              margin uses — not this recipe. Clear the item&rsquo;s Cost field to let the recipe decide.
            </p>
          )}

          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: hasSizes ? 560 : 420 }}>
            <thead><tr>
              <th style={th}>Ingredient</th>
              {hasSizes && <th style={{ ...th, width: 120 }}>For size</th>}
              <th style={{ ...th, width: 90 }}>Qty</th>
              <th style={{ ...th, width: 84 }}>Unit</th>
              <th style={{ ...th, width: 90, textAlign: 'right' }}>Line cost</th>
              <th style={{ ...th, width: 34 }} aria-label="Remove" />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const id = typeof r.inventory_item_id === 'number' ? r.inventory_item_id : 0;
                const stockUnit = id ? (unitOf.get(id) ?? '') : '';
                const choices = id ? unitChoices(conversions, stockUnit) : [];
                const unitKnown = !r.unit || choices.includes(norm(r.unit));
                const lineCost = rowCost(r);
                return (
                  <tr key={r.key}>
                    <td style={td}>
                      <select
                        value={r.inventory_item_id}
                        aria-label="Ingredient"
                        onChange={(e) => {
                          const v = e.target.value ? Number(e.target.value) : '';
                          // A new ingredient starts in its own unit; the old
                          // row's unit was for the old ingredient.
                          setRow(r.key, {
                            inventory_item_id: v,
                            unit: typeof v === 'number' ? (unitOf.get(v) ?? '') : '',
                            missing: false,
                          });
                        }}
                        style={{ ...control, cursor: 'pointer', borderColor: r.missing ? 'var(--color-danger)' : undefined }}
                      >
                        <option value="">{r.missing ? 'Ingredient was deleted — pick another' : 'Select ingredient…'}</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}{o.cost_per_unit != null ? ` (MVR ${o.cost_per_unit.toFixed(2)}/${o.unit})` : ''}
                          </option>
                        ))}
                      </select>
                      {r.missing && (
                        <span data-testid="recipe-row-missing" style={{ display: 'block', fontSize: 11, color: 'var(--color-danger)', marginTop: 3 }}>
                          This ingredient no longer exists in inventory. Until the row is fixed the dish has no cost and this ingredient is not taken from stock.
                        </span>
                      )}
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
                        aria-label="Quantity"
                        value={r.quantity}
                        onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                        style={control}
                      />
                    </td>
                    <td style={td}>
                      {/* Only units the ingredient's can be reached from: a
                          row in "cups" against flour in kilos used to be
                          taken and costed one for one. */}
                      <select
                        aria-label="Unit"
                        value={r.unit ? norm(r.unit) : stockUnit}
                        disabled={!id}
                        onChange={(e) => setRow(r.key, { unit: e.target.value })}
                        style={{ ...control, cursor: id ? 'pointer' : 'default', borderColor: unitKnown ? undefined : 'var(--color-danger)' }}
                      >
                        {!id && <option value="">—</option>}
                        {choices.map((u) => <option key={u} value={u}>{u}</option>)}
                        {!unitKnown && <option value={norm(r.unit)}>{norm(r.unit)} (no conversion)</option>}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums' }} data-testid="recipe-line-cost">
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
          </div>

          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Btn small variant="secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
              + Add ingredient
            </Btn>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text)' }}>
              These rows make
              <input
                type="number" min="1" step="any" inputMode="decimal"
                aria-label="This recipe makes"
                value={yieldQty}
                onChange={(e) => setYieldQty(e.target.value)}
                style={{ ...control, width: 84 }}
              />
              <span style={{ color: 'var(--color-text-muted)' }}>{yieldNum === 1 ? 'dish' : 'dishes'}</span>
            </label>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
            Write the rows for one dish and leave this at 1, or write a whole batch and say how many it makes.
            Cost and stock are both divided by it.
          </p>

          {unknownRows.length > 0 && (
            <p style={{ ...notice, marginTop: 12 }} data-testid="recipe-unknown-notice">
              {unknownRows.length === 1 ? 'One row' : `${unknownRows.length} rows`} cannot be costed — a deleted
              ingredient, or a unit with no conversion to the ingredient&rsquo;s. The recipe cost stays unknown until it is fixed.
            </p>
          )}

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
                    const p = v.cost === null ? null : v.price - v.cost;
                    return (
                      <tr key={v.id} data-testid={`recipe-size-cost-${v.id}`}>
                        <td style={td}>{v.name}{v.consumption_factor !== 1 ? <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}> · uses {v.consumption_factor}</span> : null}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(v.price)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(v.cost)}</td>
                        <td style={{ ...td, textAlign: 'right', color: p != null && p < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{money(p)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{p != null && v.price > 0 ? `${((p / v.price) * 100).toFixed(1)}%` : '—'}</td>
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
