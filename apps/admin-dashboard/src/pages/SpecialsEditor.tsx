import { useEffect, useId, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import {
  fetchAdminCategories,
  fetchAdminItems,
  type MenuCategory,
  type MenuItem,
  type MenuVariant,
} from '../api';
import { Btn, Input, TH, TD } from '../components/SharedUI';
import type { MenuItemSelection } from '../components/ItemSearch';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const fieldLabel: CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4,
};

const dateFieldStyle: CSSProperties = {
  width: '100%', minHeight: 44, height: 44, padding: '0 12px', boxSizing: 'border-box',
  border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 16, fontFamily: 'inherit',
  background: '#fff', color: '#1C1408',
};

export type SpecialsEditorForm = {
  item_id: number | '';
  badge_label: string;
  special_price: string;
  discount_pct: string;
  variant_overrides: Record<number, { discount_pct: string; special_price: string }>;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  max_quantity: string;
  description: string;
  is_active: boolean;
};

type Props = {
  title: string;
  editing: boolean;
  /** Start on details when editing an existing special. */
  startOnDetails?: boolean;
  form: SpecialsEditorForm;
  setForm: Dispatch<SetStateAction<SpecialsEditorForm>>;
  itemSelection: MenuItemSelection | null;
  selectedItem: MenuItem | null;
  hasVariants: boolean;
  catalogPrice: number;
  saving: boolean;
  formError: string;
  autoLoadedHint: boolean;
  conflictSpecialId: number | null;
  onSelectItem: (sel: MenuItemSelection | null) => void;
  onSetSpecialPrice: (value: string) => void;
  onSetDiscountPct: (value: string) => void;
  onSetVariantField: (variantId: number, field: 'discount_pct' | 'special_price', value: string, catalog: number) => void;
  onToggleDay: (day: number) => void;
  onOpenConflict: () => void;
  onClose: () => void;
  onSave: () => void;
};

function Alert({ tone, children }: { tone: 'green' | 'orange' | 'red'; children: ReactNode }) {
  const styles = {
    green: { bg: '#ECFDF5', border: 'rgba(34,197,94,0.35)', color: '#166534' },
    orange: { bg: '#FEF3E8', border: 'rgba(212,129,58,0.35)', color: '#9A3412' },
    red: { bg: '#FEF2F2', border: 'rgba(239,68,68,0.35)', color: '#B91C1C' },
  }[tone];
  return (
    <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: styles.bg, border: `1px solid ${styles.border}` }}>
      <div style={{ margin: 0, fontSize: 13, color: styles.color, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

/** Full-viewport 2-step editor: pick item → set discount & schedule. */
export function SpecialsEditor({
  title,
  editing,
  startOnDetails = false,
  form,
  setForm,
  itemSelection,
  selectedItem,
  hasVariants,
  catalogPrice,
  saving,
  formError,
  autoLoadedHint,
  conflictSpecialId,
  onSelectItem,
  onSetSpecialPrice,
  onSetDiscountPct,
  onSetVariantField,
  onToggleDay,
  onOpenConflict,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const [step, setStep] = useState<1 | 2>(startOnDetails && itemSelection ? 2 : 1);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminCategories()
      .then((res) => {
        if (cancelled) return;
        const cats = (res.data ?? []).filter((c) => c.is_active !== false);
        setCategories(cats.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)));
      })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoadingItems(true);
        try {
          const res = await fetchAdminItems({
            category_id: categoryId === '' ? undefined : Number(categoryId),
            search: q.trim() || undefined,
            page: 1,
            per_page: 60,
          });
          if (!cancelled) setItems(res.data ?? []);
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoadingItems(false);
        }
      })();
    }, q.trim() ? 280 : 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, categoryId, q]);

  const pickItem = (item: MenuItem) => {
    onSelectItem({ id: item.id, label: item.name, item });
    setStep(2);
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      return;
    }
    onClose();
  };

  return (
    <div
      className="specials-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="specials-editor-panel">
        <header className="specials-editor-header">
          <button type="button" className="specials-editor-icon-btn" onClick={goBack} aria-label={step === 2 ? 'Back' : 'Close'}>
            {step === 2 ? <ChevronLeft size={22} /> : <X size={20} />}
          </button>
          <div className="specials-editor-heading">
            <h2 id={titleId}>{title}</h2>
            <p>
              {step === 1 ? 'Step 1 of 2 · Choose menu item' : 'Step 2 of 2 · Price & schedule'}
            </p>
          </div>
          {step === 2 && (
            <button type="button" className="specials-editor-icon-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          )}
        </header>

        <div className="specials-editor-steps" aria-hidden>
          <span className={step === 1 ? 'is-active' : 'is-done'} />
          <span className={step === 2 ? 'is-active' : ''} />
        </div>

        <div className="specials-editor-body">
          {step === 1 ? (
            <div className="specials-picker">
              <div className="specials-picker-search">
                <Input
                  value={q}
                  onChange={setQ}
                  placeholder="Search menu items…"
                  aria-label="Search menu items"
                />
              </div>

              <div className="specials-cat-rail" role="tablist" aria-label="Categories">
                <button
                  type="button"
                  role="tab"
                  aria-selected={categoryId === ''}
                  className={`specials-cat-chip${categoryId === '' ? ' is-active' : ''}`}
                  onClick={() => setCategoryId('')}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={categoryId === c.id}
                    className={`specials-cat-chip${categoryId === c.id ? ' is-active' : ''}`}
                    onClick={() => setCategoryId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              <div className="specials-item-list">
                {loadingItems ? (
                  <p className="specials-picker-hint">Loading items…</p>
                ) : items.length === 0 ? (
                  <p className="specials-picker-hint">
                    {q.trim() || categoryId !== '' ? 'No items found.' : 'Pick a category or search by name.'}
                  </p>
                ) : (
                  items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`specials-item-row${itemSelection?.id === item.id ? ' is-selected' : ''}`}
                      onClick={() => pickItem(item)}
                    >
                      {item.image_url || item.thumb_url ? (
                        <img src={item.thumb_url || item.image_url || ''} alt="" className="specials-item-thumb" />
                      ) : (
                        <span className="specials-item-thumb specials-item-thumb--empty" />
                      )}
                      <span className="specials-item-copy">
                        <span className="specials-item-name">{item.name}</span>
                        <span className="specials-item-meta">
                          {item.category?.name ? `${item.category.name} · ` : ''}
                          MVR {parseFloat(String(item.base_price ?? 0)).toFixed(2)}
                          {item.has_variants ? ' · variants' : ''}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="specials-details">
              {itemSelection && (
                <button type="button" className="specials-selected-item" onClick={() => setStep(1)}>
                  <div>
                    <strong>{itemSelection.label}</strong>
                    <span>
                      {selectedItem?.category?.name ? `${selectedItem.category.name} · ` : ''}
                      Catalog MVR {catalogPrice.toFixed(2)}
                    </span>
                  </div>
                  <em>Change</em>
                </button>
              )}

              {autoLoadedHint && editing && (
                <Alert tone="green">
                  Loaded the existing discount for this item. Adjust pricing below, then tap Update.
                </Alert>
              )}
              {conflictSpecialId && !editing && !formError && (
                <Alert tone="orange">
                  <p style={{ margin: '0 0 8px' }}>
                    This item already has a discount for these dates. Add variant pricing to the existing discount.
                  </p>
                  <Btn small onClick={onOpenConflict}>Add to existing discount</Btn>
                </Alert>
              )}
              {formError && (
                <Alert tone="red">
                  <p style={{ margin: 0 }}>{formError}</p>
                  {conflictSpecialId && (
                    <Btn small variant="secondary" onClick={onOpenConflict} style={{ marginTop: 8 }}>
                      Add to existing discount
                    </Btn>
                  )}
                </Alert>
              )}

              {!hasVariants ? (
                <div className="specials-field-grid">
                  <label>
                    <span style={fieldLabel}>Special Price (MVR)</span>
                    <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="e.g. 39.00" value={form.special_price} onChange={onSetSpecialPrice} />
                  </label>
                  <label>
                    <span style={fieldLabel}>Discount %</span>
                    <Input type="number" min="1" max="100" inputMode="numeric" placeholder="e.g. 20" value={form.discount_pct} onChange={onSetDiscountPct} />
                  </label>
                </div>
              ) : (
                <>
                  <label>
                    <span style={fieldLabel}>Default discount % (all variants)</span>
                    <Input type="number" min="1" max="100" inputMode="numeric" placeholder="Optional" value={form.discount_pct} onChange={v => setForm(f => ({ ...f, discount_pct: v }))} />
                  </label>
                  <div className="specials-variant-block">
                    <div className="specials-variant-head">
                      <strong>Per-variant pricing</strong>
                      <p>Leave a row blank to keep that size at full price.</p>
                    </div>
                    <div className="specials-variant-cards">
                      {(selectedItem?.variants ?? []).filter((v): v is MenuVariant & { id: number } => v.id != null).map(v => {
                        const row = form.variant_overrides[v.id] ?? { discount_pct: '', special_price: '' };
                        return (
                          <div key={v.id} className="specials-variant-card">
                            <div className="specials-variant-card-title">
                              <span>{v.name}</span>
                              <span>MVR {parseFloat(String(v.price)).toFixed(2)}</span>
                            </div>
                            <div className="specials-field-grid">
                              <label>
                                <span style={fieldLabel}>Discount %</span>
                                <Input type="number" min="1" max="100" inputMode="numeric" placeholder="%" value={row.discount_pct} onChange={val => onSetVariantField(v.id, 'discount_pct', val, Number(v.price))} />
                              </label>
                              <label>
                                <span style={fieldLabel}>Special price</span>
                                <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="MVR" value={row.special_price} onChange={val => onSetVariantField(v.id, 'special_price', val, Number(v.price))} />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Desktop-friendly table fallback kept for wide screens via CSS */}
                    <table className="specials-variant-table">
                      <thead>
                        <tr>
                          {['Variant', 'Catalog', 'Discount %', 'Special price'].map(h => (
                            <th key={h} style={{ ...TH, fontSize: 11, padding: '8px 10px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedItem?.variants ?? []).filter((v): v is MenuVariant & { id: number } => v.id != null).map(v => {
                          const row = form.variant_overrides[v.id] ?? { discount_pct: '', special_price: '' };
                          return (
                            <tr key={v.id}>
                              <td style={{ ...TD, fontWeight: 600, fontSize: 12 }}>{v.name}</td>
                              <td style={{ ...TD, fontSize: 12, color: '#6B5D4F' }}>MVR {parseFloat(String(v.price)).toFixed(2)}</td>
                              <td style={{ ...TD, padding: '6px 8px' }}>
                                <Input type="number" min="1" max="100" placeholder="%" value={row.discount_pct} onChange={val => onSetVariantField(v.id, 'discount_pct', val, Number(v.price))} />
                              </td>
                              <td style={{ ...TD, padding: '6px 8px' }}>
                                <Input type="number" min="0" step="0.01" placeholder="MVR" value={row.special_price} onChange={val => onSetVariantField(v.id, 'special_price', val, Number(v.price))} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <p className="specials-help">
                {hasVariants
                  ? 'One discount per item per date range — variants share the same schedule.'
                  : catalogPrice > 0
                    ? `Price and % stay in sync (catalog MVR ${catalogPrice.toFixed(2)}).`
                    : 'Enter a sale price or a discount %.'}
              </p>

              <label>
                <span style={fieldLabel}>Badge Label</span>
                <Input placeholder="e.g. Chef's Special" value={form.badge_label} onChange={v => setForm(f => ({ ...f, badge_label: v }))} />
              </label>

              <div className="specials-field-grid">
                <label>
                  <span style={fieldLabel}>Start Date *</span>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={dateFieldStyle} />
                </label>
                <label>
                  <span style={fieldLabel}>End Date *</span>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={dateFieldStyle} />
                </label>
              </div>

              <div className="specials-field-grid">
                <label>
                  <span style={fieldLabel}>Start Time</span>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={dateFieldStyle} />
                </label>
                <label>
                  <span style={fieldLabel}>End Time</span>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={dateFieldStyle} />
                </label>
              </div>

              <div>
                <span style={{ ...fieldLabel, marginBottom: 8 }}>
                  Active Days <span style={{ color: '#9C8E7E', fontWeight: 400 }}>(empty = all)</span>
                </span>
                <div className="specials-day-row">
                  {DAY_NAMES.map((name, i) => {
                    const active = form.days_of_week.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onToggleDay(i)}
                        className={`specials-day-chip${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="specials-field-grid">
                <label>
                  <span style={fieldLabel}>Max Quantity</span>
                  <Input type="number" min="1" inputMode="numeric" placeholder="Unlimited" value={form.max_quantity} onChange={v => setForm(f => ({ ...f, max_quantity: v }))} />
                </label>
                <label className="specials-active-toggle">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 18, height: 18 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#6B5D4F' }}>Active</span>
                </label>
              </div>

              <label>
                <span style={fieldLabel}>Description</span>
                <textarea
                  placeholder="Optional…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10,
                    fontSize: 16, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <footer className="specials-editor-footer">
          {step === 1 ? (
            <>
              <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
              <Btn
                onClick={() => setStep(2)}
                disabled={!itemSelection}
              >
                Next
              </Btn>
            </>
          ) : (
            <>
              <Btn variant="secondary" onClick={() => setStep(1)}>Back</Btn>
              <Btn onClick={onSave} disabled={saving || !form.item_id}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </Btn>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
