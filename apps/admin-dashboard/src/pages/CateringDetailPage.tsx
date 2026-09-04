import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CATERING_STATUSES,
  FULFILLMENT_OPTION_KEYS,
  duplicateCateringRequest,
  fetchCateringRequest,
  replaceCateringLines,
  sendCateringQuote,
  updateCateringRequest,
  type CateringAssignee,
  type CateringLine,
  type CateringRequestRow,
} from '../api/catering';
import { ItemSearch, type MenuItemSelection } from '../components/ItemSearch';
import { PageHeader, PageShell, Btn } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';

type DraftLine = {
  key: string;
  item_id: number | null;
  variant_id: number | null;
  packaging_option_id: number | null;
  packaging_option_name: string | null;
  available_packaging_options: Array<{ id: number; name: string; fee: number; is_default: boolean }>;
  name: string;
  quantity: number;
  unit_price: string;
  notes: string;
  is_custom: boolean;
  price_needs_review: boolean;
};

function toDraftLines(lines: CateringLine[] | undefined): DraftLine[] {
  return (lines ?? []).map((l, i) => ({
    key: `l-${l.id ?? i}-${l.name}`,
    item_id: l.item_id ?? null,
    variant_id: l.variant_id ?? null,
    packaging_option_id: l.packaging_option_id ?? null,
    packaging_option_name: l.packaging_option_name ?? null,
    available_packaging_options: l.available_packaging_options ?? [],
    name: l.name,
    quantity: l.quantity,
    unit_price: l.unit_price != null ? String(l.unit_price) : '',
    notes: l.notes ?? '',
    is_custom: l.is_custom,
    price_needs_review: Boolean(l.price_needs_review),
  }));
}

function mvr(laar: number): string {
  return (laar / 100).toFixed(2);
}

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  marginTop: 4,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  padding: '0 10px',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 };

export function CateringDetailPage() {
  usePageTitle('Event quote');
  const { id } = useParams();
  const navigate = useNavigate();
  const requestId = Number(id);

  const [row, setRow] = useState<CateringRequestRow | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [assignees, setAssignees] = useState<CateringAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [itemPick, setItemPick] = useState<MenuItemSelection | null>(null);
  const [paymentMvr, setPaymentMvr] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);
  const [customName, setCustomName] = useState('');

  const load = () => {
    if (!Number.isFinite(requestId)) return;
    setLoading(true);
    setError('');
    fetchCateringRequest(requestId)
      .then((res) => {
        setRow(res.request);
        setLines(toDraftLines(res.request.lines));
        setAssignees(res.request.assignees ?? []);
        const total = res.request.tax_preview?.total_laar;
        if (total != null && !paymentMvr) {
          setPaymentMvr(mvr(total));
        }
        setIsDeposit(Boolean(res.request.quote_is_deposit));
        if (res.request.quote_payment_laar != null) {
          setPaymentMvr(mvr(res.request.quote_payment_laar));
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [requestId]);

  const patchField = async (payload: Record<string, unknown>) => {
    if (!row) return;
    setSaving(true);
    setError('');
    try {
      const { request } = await updateCateringRequest(row.id, payload);
      setRow(request);
      if (request.assignees) setAssignees(request.assignees);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveLines = async () => {
    if (!row) return;
    setSaving(true);
    setError('');
    try {
      const { request } = await replaceCateringLines(row.id, buildLinePayload());
      setRow(request);
      setLines(toDraftLines(request.lines));
      if (request.tax_preview) setPaymentMvr(mvr(request.tax_preview.total_laar));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const buildLinePayload = () => lines.map((l) => {
    if (l.is_custom) {
      return {
        custom_name: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price === '' ? null : parseFloat(l.unit_price),
        notes: l.notes || null,
        is_custom: true,
        price_needs_review: l.price_needs_review,
      };
    }
    return {
      item_id: l.item_id!,
      variant_id: l.variant_id,
      packaging_option_id: l.packaging_option_id,
      quantity: l.quantity,
      notes: l.notes || null,
      is_custom: false,
    };
  });

  const sendQuote = async () => {
    if (!row) return;
    const amount = parseFloat(paymentMvr);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    if ((row.fulfillment_method ?? 'pickup') === 'delivery' && !row.delivery_address?.trim()) {
      setError('Delivery address is required before sending.');
      return;
    }
    const unpriced = lines.some((l) => l.is_custom && l.unit_price === '');
    if (unpriced) {
      setError('Price all custom lines before sending.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await replaceCateringLines(row.id, buildLinePayload());
      const { request } = await sendCateringQuote(row.id, {
        payment_amount_mvr: amount,
        is_deposit: isDeposit,
      });
      setRow(request);
      setLines(toDraftLines(request.lines));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDuplicate = async () => {
    if (!row) return;
    setSaving(true);
    setError('');
    try {
      const { request } = await duplicateCateringRequest(row.id);
      navigate(`/catering/${request.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const addCatalogItem = (sel: MenuItemSelection | null) => {
    setItemPick(sel);
    if (!sel) return;
    const opts = (sel.item.packaging_options ?? [])
      .filter((o): o is typeof o & { id: number } => o.id != null && o.is_active !== false)
      .map((o) => ({
        id: o.id,
        name: o.name,
        fee: Number(o.fee ?? 0),
        is_default: Boolean(o.is_default),
      }));
    const defaultOpt = opts.find((o) => o.is_default) ?? opts[0] ?? null;
    setLines((prev) => [
      ...prev,
      {
        key: `new-${sel.id}-${Date.now()}`,
        item_id: sel.id,
        variant_id: null,
        packaging_option_id: defaultOpt?.id ?? null,
        packaging_option_name: defaultOpt?.name ?? null,
        available_packaging_options: opts,
        name: sel.label,
        quantity: 1,
        unit_price: String(sel.item.base_price ?? ''),
        notes: '',
        is_custom: false,
        price_needs_review: false,
      },
    ]);
    setItemPick(null);
  };

  const addCustomLine = () => {
    const name = customName.trim();
    if (!name) return;
    setLines((prev) => [
      ...prev,
      {
        key: `custom-${Date.now()}`,
        item_id: null,
        variant_id: null,
        packaging_option_id: null,
        packaging_option_name: null,
        available_packaging_options: [],
        name,
        quantity: 1,
        unit_price: '',
        notes: '',
        is_custom: true,
        price_needs_review: false,
      },
    ]);
    setCustomName('');
  };

  const opts = (row?.fulfillment_options ?? {}) as Record<string, boolean>;
  const tax = row?.tax_preview;
  const timeline = [
    { label: 'Created', at: row?.created_at },
    { label: 'Contacted', at: row?.contacted_at },
    { label: 'Quoted', at: row?.quoted_at },
    { label: 'Quote sent', at: row?.quote_sent_at },
    { label: 'Confirmed', at: row?.confirmed_at },
  ];

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>;
  if (!row) return <p style={{ color: 'var(--color-danger-strong)' }}>{error || 'Not found'}</p>;

  return (
    <PageShell>
    <div>
      <PageHeader section="Customers & Marketing"
        title={row.reference ? `${row.reference}` : `Event #${row.id}`}
        subtitle={`${row.contact_name} · ${row.phone}${row.event_date ? ` · ${row.event_date}` : ''}`}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link to="/catering" style={{ fontSize: 13, color: 'var(--color-warning-strong)', fontWeight: 700 }}>← Pipeline</Link>
        <Btn onClick={() => void onDuplicate()} disabled={saving}>Duplicate event</Btn>
        <Btn onClick={() => void saveLines()} disabled={saving} variant="secondary">Save lines</Btn>
      </div>

      {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13 }}>{error}</p>}

      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Lines */}
          <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Quote lines</h3>
            {lines.map((l, idx) => (
              <div key={l.key} style={{ borderBottom: '1px solid #F0E8E0', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {l.name}
                    {l.is_custom && <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}> · custom</span>}
                    {l.price_needs_review && (
                      <span
                        data-testid="price-review-badge"
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--color-warning-strong)',
                          background: 'var(--color-warning-bg)',
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        copied price — review
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ border: 'none', background: 'none', color: 'var(--color-danger-strong)', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" aria-label="Decrease qty" onClick={() => setLines((p) => p.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))} style={{ minWidth: 44, minHeight: 44 }}>-</button>
                  <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{l.quantity}</span>
                  <button type="button" aria-label="Increase qty" onClick={() => setLines((p) => p.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x))} style={{ minWidth: 44, minHeight: 44 }}>+</button>
                  <label style={{ ...labelStyle, flex: 1, minWidth: 120 }}>
                    Unit price (MVR)
                    <input
                      data-testid={l.is_custom ? 'custom-price-input' : 'catalog-price-input'}
                      disabled={!l.is_custom}
                      style={{ ...fieldStyle, background: l.is_custom ? 'var(--color-surface)' : '#F5F0EB' }}
                      value={l.unit_price}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((p) => p.map((x, i) => i === idx ? { ...x, unit_price: v, price_needs_review: false } : x));
                      }}
                    />
                  </label>
                </div>
                {!l.is_custom && (
                  <div style={{ marginTop: 8 }}>
                    {l.available_packaging_options.length > 1 ? (
                      <label style={{ ...labelStyle, display: 'block' }}>
                        Packaging
                        <select
                          data-testid={`packaging-select-${idx}`}
                          style={fieldStyle}
                          value={l.packaging_option_id ?? ''}
                          onChange={(e) => {
                            const id = e.target.value ? Number(e.target.value) : null;
                            const opt = l.available_packaging_options.find((o) => o.id === id);
                            setLines((p) => p.map((x, i) => i === idx ? {
                              ...x,
                              packaging_option_id: id,
                              packaging_option_name: opt?.name ?? null,
                            } : x));
                          }}
                        >
                          {l.available_packaging_options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}{o.fee > 0 ? ` (+MVR ${o.fee.toFixed(2)})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      l.packaging_option_name && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }} data-testid={`packaging-label-${idx}`}>
                          Packaging: {l.packaging_option_name}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}

            <div style={{ marginTop: 14 }}>
              <p style={{ ...labelStyle, marginBottom: 6 }}>Add catalog item</p>
              <ItemSearch kind="menu" value={itemPick} onChange={addCatalogItem} placeholder="Search menu…" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
              <label style={{ ...labelStyle, flex: 1 }}>
                Custom line
                <input
                  data-testid="custom-line-name"
                  style={fieldStyle}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Delivery / setup fee"
                />
              </label>
              <Btn onClick={addCustomLine}>Add</Btn>
            </div>
          </section>

          {/* Fulfilment */}
          <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Fulfilment</h3>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={labelStyle}>
                Method
                <select
                  style={fieldStyle}
                  value={row.fulfillment_method ?? 'pickup'}
                  onChange={(e) => void patchField({ fulfillment_method: e.target.value })}
                >
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </select>
              </label>
              <label style={labelStyle}>
                Event date
                <input type="date" style={fieldStyle} value={row.event_date ?? ''} onChange={(e) => void patchField({ event_date: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                Event time
                <input type="time" style={fieldStyle} value={row.fulfillment_time ?? ''} onChange={(e) => void patchField({ fulfillment_time: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                Setup time
                <input type="time" style={fieldStyle} value={row.setup_time ?? ''} onChange={(e) => void patchField({ setup_time: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                Venue
                <input style={fieldStyle} value={row.venue_name ?? ''} onChange={(e) => setRow({ ...row, venue_name: e.target.value })} onBlur={(e) => void patchField({ venue_name: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                Headcount
                <input type="number" style={fieldStyle} value={row.headcount ?? ''} onChange={(e) => setRow({ ...row, headcount: e.target.value === '' ? null : Number(e.target.value) })} onBlur={() => void patchField({ headcount: row.headcount })} />
              </label>
              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Delivery address
                <input style={fieldStyle} value={row.delivery_address ?? ''} onChange={(e) => setRow({ ...row, delivery_address: e.target.value })} onBlur={(e) => void patchField({ delivery_address: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                Island
                <input style={fieldStyle} value={row.delivery_island ?? ''} onChange={(e) => setRow({ ...row, delivery_island: e.target.value })} onBlur={(e) => void patchField({ delivery_island: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                On-site contact
                <input style={fieldStyle} value={row.onsite_contact_name ?? ''} onChange={(e) => setRow({ ...row, onsite_contact_name: e.target.value })} onBlur={(e) => void patchField({ onsite_contact_name: e.target.value || null })} />
              </label>
              <label style={labelStyle}>
                On-site phone
                <input style={fieldStyle} value={row.onsite_contact_phone ?? ''} onChange={(e) => setRow({ ...row, onsite_contact_phone: e.target.value })} onBlur={(e) => void patchField({ onsite_contact_phone: e.target.value || null })} />
              </label>
              <label style={{ ...labelStyle, gridColumn: '1 / -1', color: 'var(--color-warning-strong)', background: 'var(--color-warning-bg)', padding: 10, borderRadius: 8 }}>
                Dietary notes (prominent)
                <textarea
                  data-testid="dietary-notes"
                  style={{ ...fieldStyle, minHeight: 72, padding: 10 }}
                  value={row.dietary_notes ?? ''}
                  onChange={(e) => setRow({ ...row, dietary_notes: e.target.value })}
                  onBlur={(e) => void patchField({ dietary_notes: e.target.value || null })}
                />
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <p style={labelStyle}>Ops options</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                {FULFILLMENT_OPTION_KEYS.map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(opts[key])}
                      onChange={(e) => {
                        const next = { ...opts, [key]: e.target.checked };
                        setRow({ ...row, fulfillment_options: next });
                        void patchField({ fulfillment_options: next });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Quote summary</h3>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              <div>Subtotal: MVR {tax ? mvr(tax.subtotal_laar) : '—'}</div>
              {(tax?.packaging_fee_laar ?? 0) > 0 && (
                <div data-testid="quote-packaging-fee">
                  {tax?.packaging_fee_label ?? 'Packaging fee'}: MVR {mvr(tax!.packaging_fee_laar!)}
                </div>
              )}
              <div>GST: MVR {tax ? mvr(tax.tax_laar) : '—'}</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Total: MVR {tax ? mvr(tax.total_laar) : '—'}</div>
            </div>
            <label style={{ ...labelStyle, display: 'block', marginTop: 14 }}>
              Payment amount (MVR)
              <input data-testid="payment-amount" style={fieldStyle} value={paymentMvr} onChange={(e) => setPaymentMvr(e.target.value)} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 44, fontSize: 13 }}>
              <input data-testid="deposit-toggle" type="checkbox" checked={isDeposit} onChange={(e) => setIsDeposit(e.target.checked)} />
              This is a deposit
            </label>
            <Btn data-testid="send-quote-btn" onClick={() => void sendQuote()} disabled={saving} style={{ marginTop: 12, width: '100%' }}>
              {row.has_live_quote ? `Resend quote (v${row.quote_version ?? 1})` : `Send quote (v${row.quote_version ?? 1})`}
            </Btn>
            {row.quote_expires_at && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                Expires {new Date(row.quote_expires_at).toLocaleString()}
              </p>
            )}
            {row.quote_url && (
              <p style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-all' }}>{row.quote_url}</p>
            )}
          </section>

          <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Assignment & status</h3>
            <label style={labelStyle}>
              Assigned to
              <select
                data-testid="assignee-select"
                style={fieldStyle}
                value={row.handled_by ?? ''}
                onChange={(e) => void patchField({ handled_by: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, display: 'block', marginTop: 10 }}>
              Status
              <select style={fieldStyle} value={row.status} onChange={(e) => void patchField({ status: e.target.value })}>
                {CATERING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, display: 'block', marginTop: 10 }}>
              Staff notes
              <textarea
                style={{ ...fieldStyle, minHeight: 72, padding: 10 }}
                value={row.staff_notes ?? ''}
                onChange={(e) => setRow({ ...row, staff_notes: e.target.value })}
                onBlur={(e) => void patchField({ staff_notes: e.target.value || null })}
              />
            </label>
            <label style={{ ...labelStyle, display: 'block', marginTop: 10 }}>
              POS order ID
              <input
                style={fieldStyle}
                value={row.pos_order_id ?? ''}
                onChange={(e) => setRow({ ...row, pos_order_id: e.target.value === '' ? null : Number(e.target.value) })}
                onBlur={() => void patchField({ pos_order_id: row.pos_order_id })}
              />
            </label>
          </section>

          <section style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Status timeline</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {timeline.map((t) => (
                <li key={t.label} style={{ marginBottom: 6 }}>
                  <strong>{t.label}</strong>
                  {t.at ? ` — ${new Date(t.at).toLocaleString()}` : ' — —'}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>

    </PageShell>
  );
}

export default CateringDetailPage;
