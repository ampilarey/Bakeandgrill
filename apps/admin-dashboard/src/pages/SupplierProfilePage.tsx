import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, Phone, ShoppingCart, Star } from 'lucide-react';
import {
  fetchSupplierItems, fetchSupplierOverview, fetchSupplierRatings, fetchItemPriceHistory,
  recordPurchasePayment, clearPurchasePayment,
  type SupplierCard, type SupplierItem, type PurchasePaymentMethod,
} from '../api/purchasing';
import { createPurchaseFromSuggest, fetchPurchases, rateSupplier, updateSupplier, type Purchase } from '../api';
import { Badge, Btn, Card, Modal, ModalActions, PageHeader, PageShell, StatCard, TabScrollRow, TD, TH } from '../components/SharedUI';
import { ItemThumb } from '../components/InventoryItemPhoto';
import { PriceHistoryChart } from '../components/PriceHistoryChart';
import { ChangeBadge } from './PriceChangesPage';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePageTitle } from '../hooks/usePageTitle';
import { downloadCSV } from '../utils/csvExport';
import { fmt } from '../utils/fmt';

/*
 * One supplier — everything we have bought from them.
 *
 * Owner, 2026-09-20: "in suppliers list, when clicked, can u add advanced
 * features to know all the po and items bought from each supplier". Before
 * this, a supplier's name in the list did nothing; their orders were a
 * search on the Purchase orders tab and their prices a one-item-at-a-time
 * lookup behind "View History". Now the name opens this page: how much and
 * how often, every order, every item with what it cost first and last and
 * whether anybody else sells it cheaper, the ratings, and the details.
 */

type Tab = 'overview' | 'orders' | 'items' | 'ratings' | 'details';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Purchase orders' },
  { id: 'items', label: 'Items bought' },
  { id: 'ratings', label: 'Ratings' },
  { id: 'details', label: 'Details' },
];

const money = (n: number) => `MVR ${fmt(n, n !== 0 && Math.abs(n) < 1 ? 4 : 2)}`;

const shortDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const monthLabel = (ym: string) => {
  const d = new Date(`${ym}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString('en-GB', { month: 'short' });
};

const STATUS_COLOR: Record<string, string> = { draft: 'gray', ordered: 'blue', partial: 'yellow', received: 'green', cancelled: 'red' };

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Not rated</span>;
  const n = Math.round(value);
  return (
    <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--color-warning)' }}>{'★'.repeat(n)}</span>
      <span style={{ color: 'var(--color-border)' }}>{'★'.repeat(5 - n)}</span>
      <span style={{ color: 'var(--color-text-muted)', marginLeft: 6, fontSize: 12 }}>{value.toFixed(1)}</span>
    </span>
  );
}

const cellLabel: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 };

export default function SupplierProfilePage({ supplierId }: { supplierId: number }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { can } = useCurrentUserPermissions();
  const [tab, setTab] = useState<Tab>('overview');

  const overview = useQuery({
    queryKey: ['purchasing', 'supplier', supplierId, 'overview'],
    queryFn: () => fetchSupplierOverview(supplierId),
  });
  const supplier = overview.data?.supplier ?? null;
  usePageTitle(supplier ? `Purchasing · ${supplier.name}` : 'Purchasing · Supplier');

  const canRate = can('suppliers.manage');
  const tabs = TABS.filter((t) => t.id !== 'ratings' || canRate);

  return (
    <PageShell>
      <PageHeader section="Manage" title={supplier?.name ?? 'Supplier'} />

      <div style={{ marginBottom: 12 }}>
        <Link to="/purchasing/suppliers" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none', fontWeight: 600 }}>
          <ArrowLeft size={14} /> All suppliers
        </Link>
      </div>

      {overview.error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13 }}>{(overview.error as Error).message}</p>}

      {supplier && (
        <Card style={{ marginBottom: 16 }} data-testid="supplier-head">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>{supplier.name}</h2>
                {!supplier.is_active && <Badge color="red" label="Inactive" />}
                {overview.data && overview.data.orders.open > 0 && <Badge color="blue" label={`${overview.data.orders.open} open order${overview.data.orders.open === 1 ? '' : 's'}`} />}
                {overview.data && overview.data.owed.amount > 0 && (
                  <span data-testid="supplier-owed"><Badge color="orange" label={`Owed ${money(overview.data.owed.amount)} · ${overview.data.owed.orders} order${overview.data.owed.orders === 1 ? '' : 's'}`} /></span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {supplier.contact_name && <span>{supplier.contact_name}</span>}
                {[supplier.phone, ...supplier.extra_phones].filter(Boolean).map((p) => (
                  <a key={p} href={`tel:${p}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
                    <Phone size={12} /> {p}
                  </a>
                ))}
                {supplier.email && <span>{supplier.email}</span>}
              </div>
              {supplier.bank_account_number && (
                <div style={{ fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} data-testid="supplier-bank">
                  <span style={cellLabel}>Bank</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{supplier.bank_account_number}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{[supplier.bank_name, supplier.bank_account_name].filter(Boolean).join(' · ')}</span>
                  <CopyButton text={supplier.bank_account_number} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {can('suppliers.purchases') && (
                <Btn small variant="secondary" onClick={() => navigate(`/purchasing/orders?search=${encodeURIComponent(supplier.name)}`)}>Open in Purchase orders</Btn>
              )}
              {can('suppliers.manage') && (
                <Btn small variant="secondary" onClick={() => navigate(`/purchasing/suppliers?edit=${supplier.id}`)}>Edit</Btn>
              )}
            </div>
          </div>
        </Card>
      )}

      <div style={{ marginBottom: 16 }}>
        <TabScrollRow role="tablist" aria-label="Supplier" fit>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: tab === t.id ? 'var(--color-primary)' : 'transparent',
                color: tab === t.id ? 'var(--color-on-primary, white)' : 'var(--color-text-secondary)',
              }}
            >
              {t.label}
            </button>
          ))}
        </TabScrollRow>
      </div>

      {overview.isLoading && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>}

      {tab === 'overview' && overview.data && <OverviewTab data={overview.data} isMobile={isMobile} onSeeItems={() => setTab('items')} />}
      {tab === 'orders' && supplier && <OrdersTab supplier={supplier} isMobile={isMobile} canPay={can('suppliers.purchases')} />}
      {tab === 'items' && supplier && <ItemsTab supplier={supplier} isMobile={isMobile} canOrder={can('suppliers.purchases')} />}
      {tab === 'ratings' && supplier && canRate && <RatingsTab supplier={supplier} />}
      {tab === 'details' && supplier && <DetailsTab supplier={supplier} canEdit={can('suppliers.manage')} />}
    </PageShell>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy account number"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--color-border)', background: 'var(--color-surface)', borderRadius: 6, padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-secondary)', fontFamily: 'inherit' }}
    >
      <Copy size={11} /> {done ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Overview ────────────────────────────────────────────────────────────

function OverviewTab({ data, isMobile, onSeeItems }: { data: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchSupplierOverview>>>>['data']>; isMobile: boolean; onSeeItems: () => void }) {
  const o = data.orders;
  const maxSpend = Math.max(0, ...data.monthly.map((m) => m.spend));
  return (
    <div data-testid="supplier-overview">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total spend" value={money(o.spend)} sub={`${o.count} order${o.count === 1 ? '' : 's'} placed`} accent="var(--color-primary)" />
        <StatCard label="Average order" value={o.average != null ? money(o.average) : '—'} sub={o.days_between != null ? `Every ${o.days_between} days` : 'Not enough orders yet'} accent="var(--color-warning)" />
        <StatCard label="Last order" value={o.last_date ? shortDate(o.last_date) : '—'} sub={o.first_date ? `First ${shortDate(o.first_date)}` : 'Nothing yet'} accent="var(--color-success)" />
        <StatCard
          label="On time"
          value={o.on_time ? `${o.on_time.rate}%` : '—'}
          sub={o.on_time ? `${o.on_time.on_time} of ${o.on_time.timed} dated deliveries` : 'No delivery dates recorded'}
          accent={o.on_time && o.on_time.rate < 80 ? 'var(--color-danger)' : 'var(--color-success)'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 12 }}>
        <Card>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spend by month</p>
          {maxSpend === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>Nothing bought in the last 12 months.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140 }} data-testid="supplier-monthly">
              {data.monthly.map((m) => (
                <div key={m.month} title={`${m.month}: ${money(m.spend)} · ${m.orders} order${m.orders === 1 ? '' : 's'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', maxWidth: 28, height: `${Math.max(2, (m.spend / maxSpend) * 100)}%`, background: m.spend > 0 ? 'var(--color-primary)' : 'var(--color-border)', borderRadius: 4 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top items by spend</p>
            <button type="button" onClick={onSeeItems} style={{ border: 'none', background: 'none', color: 'var(--color-primary)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              All {data.items.count} items
            </button>
          </div>
          {data.items.top.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>No items yet.</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="supplier-top-items">
              {data.items.top.map((t) => (
                <li key={t.item_id}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}> · {money(t.spend)} · {t.orders} order{t.orders === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ol>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
            <div><div style={cellLabel}>Rating</div><Stars value={data.ratings.overall} /></div>
            {Object.entries(o.by_status).filter(([, n]) => n > 0).map(([s, n]) => (
              <div key={s}><div style={cellLabel}>{s[0].toUpperCase() + s.slice(1)}</div><div style={{ fontWeight: 700 }}>{n}</div></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Purchase orders ─────────────────────────────────────────────────────

const PAY_COLOR: Record<string, string> = { paid: 'green', partial: 'yellow', unpaid: 'orange' };

function PaidBadge({ p }: { p: Purchase }) {
  const st = p.payment_status ?? 'none';
  if (st === 'none') return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  return (
    <span data-testid={`paid-${p.id}`}>
      <Badge color={PAY_COLOR[st] ?? 'gray'} label={st === 'partial' ? `Owes ${money(Number(p.owed ?? 0))}` : st} />
      {st === 'paid' && p.paid_at && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortDate(p.paid_at)}{p.payment_method ? ` · ${p.payment_method}` : ''}</div>}
    </span>
  );
}

function OrdersTab({ supplier, isMobile, canPay }: { supplier: SupplierCard; isMobile: boolean; canPay: boolean }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState<Purchase | null>(null);
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['purchasing', 'supplier', supplier.id, 'orders', status, from, to, page],
    queryFn: () => fetchPurchases({ supplier_id: supplier.id, status: status === 'all' ? undefined : status, from: from || undefined, to: to || undefined, page }),
  });
  const rows: Purchase[] = q.data?.purchases.data ?? [];
  const total = rows.filter((p) => p.status !== 'cancelled' && p.status !== 'draft').reduce((s, p) => s + Number(p.total), 0);
  const owed = rows.reduce((s, p) => s + Number(p.owed ?? 0), 0);

  const exportCsv = () => downloadCSV(`${supplier.name}-orders.csv`, rows.map((p) => ({
    'PO': p.purchase_number, 'Date': p.purchase_date ?? '', 'Status': p.status, 'Lines': p.items?.length ?? 0,
    'Total': Number(p.total).toFixed(2), 'Invoice': p.supplier_invoice_no ?? '',
  })));

  return (
    <div data-testid="supplier-orders">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status" style={selectStyle}>
          {['all', 'draft', 'ordered', 'partial', 'received', 'cancelled'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" style={selectStyle} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" style={selectStyle} />
        <Btn small variant="secondary" onClick={exportCsv} disabled={rows.length === 0}><Download size={13} /> CSV</Btn>
      </div>

      {q.isLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
        : rows.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No orders match.</p>
        : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((p) => (
              <Link key={p.id} to={`/purchasing/orders?search=${encodeURIComponent(p.purchase_number)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.purchase_number}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{shortDate(p.purchase_date)} · {p.items?.length ?? 0} line{(p.items?.length ?? 0) === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{money(Number(p.total))}</div>
                      <Badge color={STATUS_COLOR[p.status] ?? 'gray'} label={p.status} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
                    <PaidBadge p={p} />
                    {canPay && p.payment_status && p.payment_status !== 'none' && p.payment_status !== 'paid' && (
                      <Btn small variant="secondary" onClick={(e) => { e.preventDefault(); setPaying(p); }}>Record payment</Btn>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={TH}>PO</th><th style={TH}>Date</th><th style={TH}>Status</th><th style={TH}>Items</th><th style={TH}>Delivered</th><th style={TH}>Total</th><th style={TH}>Paid</th>
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td style={TD}>
                      <Link to={`/purchasing/orders?search=${encodeURIComponent(p.purchase_number)}`} style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}>{p.purchase_number}</Link>
                      {p.supplier_invoice_no && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Inv {p.supplier_invoice_no}</div>}
                    </td>
                    <td style={TD}>{shortDate(p.purchase_date)}</td>
                    <td style={TD}><Badge color={STATUS_COLOR[p.status] ?? 'gray'} label={p.status} /></td>
                    <td style={TD}>
                      <span title={(p.items ?? []).map((i) => i.inventory_item?.name ?? '?').join(', ')}>
                        {(p.items ?? []).slice(0, 3).map((i) => i.inventory_item?.name ?? '?').join(', ')}
                        {(p.items?.length ?? 0) > 3 ? ` +${(p.items?.length ?? 0) - 3}` : ''}
                      </span>
                    </td>
                    <td style={TD}>{p.actual_delivery_date ? shortDate(p.actual_delivery_date) : p.expected_delivery_date ? <span style={{ color: 'var(--color-text-muted)' }}>due {shortDate(p.expected_delivery_date)}</span> : '—'}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{money(Number(p.total))}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <PaidBadge p={p} />
                        {canPay && p.payment_status && p.payment_status !== 'none' && p.payment_status !== 'paid' && (
                          <Btn small variant="secondary" onClick={() => setPaying(p)}>Record payment</Btn>
                        )}
                        {canPay && p.payment_status === 'paid' && (
                          <button type="button" onClick={() => void clearPurchasePayment(p.id).then(() => qc.invalidateQueries({ queryKey: ['purchasing'] }))} style={{ border: 'none', background: 'none', color: 'var(--color-text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Undo</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ ...TD, fontWeight: 700 }} colSpan={5}>Total of placed orders on this page</td>
                <td style={{ ...TD, fontWeight: 800 }} data-testid="supplier-orders-total">{money(total)}</td>
                <td style={{ ...TD, fontWeight: 700 }} data-testid="supplier-orders-owed">{owed > 0 ? `${money(owed)} owed` : 'All paid'}</td>
              </tr></tfoot>
            </table>
          </div>
        )}

      {q.data && q.data.purchases.last_page > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, alignItems: 'center', fontSize: 13 }}>
          <Btn small variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
          <span>Page {q.data.purchases.current_page} of {q.data.purchases.last_page}</span>
          <Btn small variant="secondary" disabled={page >= q.data.purchases.last_page} onClick={() => setPage((p) => p + 1)}>Next</Btn>
        </div>
      )}

      {paying && (
        <PaymentModal
          purchase={paying}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); void qc.invalidateQueries({ queryKey: ['purchasing'] }); }}
        />
      )}
    </div>
  );
}

/**
 * Money out against one order (owner, 2026-09-21). The amount starts at what
 * is still owed, so "Mark paid" is one tap; a part payment is a smaller
 * number typed over it.
 */
function PaymentModal({ purchase, onClose, onSaved }: { purchase: Purchase; onClose: () => void; onSaved: () => void }) {
  const owedNow = Number(purchase.owed ?? purchase.total);
  const [amount, setAmount] = useState(String(owedNow.toFixed(2)));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PurchasePaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const num = Number(amount);
  const valid = Number.isFinite(num) && num > 0 && num <= owedNow + 0.005;

  const save = async () => {
    setSaving(true); setError('');
    try {
      await recordPurchasePayment(purchase.id, { amount: Math.round(num * 100) / 100, paid_on: paidOn, method, reference: reference.trim() || undefined });
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Record payment — ${purchase.purchase_number}`} onClose={onClose} maxWidth={420}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Order total {money(Number(purchase.total))}{Number(purchase.paid_amount ?? 0) > 0 ? `, ${money(Number(purchase.paid_amount))} paid so far` : ''}. Still owed <strong>{money(owedNow)}</strong>.
      </p>
      {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13 }}>{error}</p>}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="pay-amount">Amount (MVR)</label>
      <input id="pay-amount" type="number" min={0.01} step={0.01} max={owedNow} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="pay-date">Paid on</label>
      <input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="pay-method">How</label>
      <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PurchasePaymentMethod)} style={{ ...selectStyle, width: '100%', marginBottom: 10 }}>
        <option value="cash">Cash</option><option value="transfer">Bank transfer</option><option value="other">Other</option>
      </select>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="pay-ref">Reference (optional)</label>
      <input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer ref, receipt no…" style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }} />
      <ModalActions>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => void save()} disabled={saving || !valid}>{saving ? 'Saving…' : num + 0.005 >= owedNow ? 'Mark paid' : 'Record part payment'}</Btn>
      </ModalActions>
    </Modal>
  );
}

const selectStyle: React.CSSProperties = {
  minHeight: 38, padding: '0 10px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit',
  background: 'var(--color-surface)', color: 'var(--color-text)',
};

// ── Items bought ────────────────────────────────────────────────────────

function ItemsTab({ supplier, isMobile, canOrder }: { supplier: SupplierCard; isMobile: boolean; canOrder: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<SupplierItem | null>(null);
  // Owner, 2026-09-21: order the same things again from here.
  const [picked, setPicked] = useState<number[]>([]);
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState('');
  const togglePick = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const q = useQuery({
    queryKey: ['purchasing', 'supplier', supplier.id, 'items'],
    queryFn: () => fetchSupplierItems(supplier.id),
  });
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.items ?? []).filter((i) => !s || i.name.toLowerCase().includes(s));
  }, [q.data, search]);
  const cheaperCount = (q.data?.items ?? []).filter((i) => i.elsewhere?.cheaper).length;

  const reorder = async () => {
    const chosen = (q.data?.items ?? []).filter((i) => picked.includes(i.item_id));
    if (chosen.length === 0) return;
    setOrdering(true); setOrderError('');
    try {
      const res = await createPurchaseFromSuggest({
        supplier_id: supplier.id,
        items: chosen.map((i) => ({ inventory_item_id: i.item_id, quantity: i.last.quantity, unit_cost: i.last.price })),
        notes: `Reordered from ${supplier.name}'s page`,
      });
      navigate(`/purchasing/orders?search=${encodeURIComponent(res.purchase.purchase_number)}`);
    } catch (e) { setOrderError((e as Error).message); setOrdering(false); }
  };

  const exportCsv = () => downloadCSV(`${supplier.name}-items.csv`, rows.map((i) => ({
    'Item': i.name, 'Unit': i.unit, 'Orders': i.orders, 'Quantity': i.quantity, 'Spend': i.spend.toFixed(2),
    'First price': i.first.price, 'Last price': i.last.price, 'Change %': i.change_pct ?? '', 'Last bought': i.last.date ?? '',
    'Cheaper elsewhere': i.elsewhere?.cheaper ? `${i.elsewhere.supplier ?? ''} ${i.elsewhere.price}` : '',
  })));

  return (
    <div data-testid="supplier-items">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" aria-label="Search items" style={{ ...selectStyle, flex: '1 1 180px', maxWidth: 300 }} />
        {cheaperCount > 0 && <Badge color="orange" label={`${cheaperCount} cheaper elsewhere`} />}
        {canOrder && (
          <Btn small onClick={() => void reorder()} disabled={picked.length === 0 || ordering}>
            <ShoppingCart size={13} /> {ordering ? 'Creating…' : `Order again${picked.length ? ` (${picked.length})` : ''}`}
          </Btn>
        )}
        {orderError && <span style={{ color: 'var(--color-danger-strong)', fontSize: 12 }}>{orderError}</span>}
        <Btn small variant="secondary" onClick={exportCsv} disabled={rows.length === 0}><Download size={13} /> CSV</Btn>
      </div>

      {q.isLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
        : rows.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{q.data && q.data.items.length === 0 ? 'Nothing bought from this supplier yet.' : 'Nothing matches.'}</p>
        : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((i) => (
              <div key={i.item_id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canOrder && <input type="checkbox" aria-label={`Pick ${i.name}`} checked={picked.includes(i.item_id)} onChange={() => togglePick(i.item_id)} />}
              <button type="button" onClick={() => setOpen(i)} style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', flex: 1, minWidth: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                <ItemThumb url={i.photo_url} name={i.name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{i.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{money(i.last.price)} / {i.unit} · {i.orders} order{i.orders === 1 ? '' : 's'} · {money(i.spend)}</div>
                  {i.elsewhere?.cheaper && <div style={{ fontSize: 11, color: 'var(--color-warning-strong)', fontWeight: 600 }}>{i.elsewhere.supplier} charges {money(i.elsewhere.price)}</div>}
                </div>
                <ChangeBadge pct={i.change_pct} />
              </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="supplier-items-table">
              <thead><tr>
                {canOrder && <th style={TH}><input type="checkbox" aria-label="Pick every item" checked={rows.length > 0 && rows.every((i) => picked.includes(i.item_id))} onChange={(e) => setPicked(e.target.checked ? rows.map((i) => i.item_id) : [])} /></th>}
                <th style={TH}>Item</th><th style={TH}>Orders</th><th style={TH}>Quantity</th><th style={TH}>Spend</th><th style={TH}>Last price</th><th style={TH}>First price</th><th style={TH}>Change</th><th style={TH}>Elsewhere</th>
              </tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.item_id} onClick={() => setOpen(i)} style={{ cursor: 'pointer' }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(i); } }}>
                    {canOrder && (
                      <td style={TD} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Pick ${i.name}`} checked={picked.includes(i.item_id)} onChange={() => togglePick(i.item_id)} />
                      </td>
                    )}
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ItemThumb url={i.photo_url} name={i.name} size={32} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{i.name}{!i.is_active && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> (inactive)</span>}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>per {i.unit}{i.last.brand ? ` · ${i.last.brand}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td style={TD}>{i.orders}</td>
                    <td style={TD}>{fmt(i.quantity, 0)} {i.unit}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{money(i.spend)}</td>
                    <td style={TD}><div style={{ fontWeight: 700 }}>{money(i.last.price)}</div><div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortDate(i.last.date)}</div></td>
                    <td style={TD}><div>{money(i.first.price)}</div><div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{shortDate(i.first.date)}</div></td>
                    <td style={TD}><ChangeBadge pct={i.change_pct} /></td>
                    <td style={TD}>
                      {i.elsewhere ? (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ fontWeight: i.elsewhere.cheaper ? 700 : 500, color: i.elsewhere.cheaper ? 'var(--color-warning-strong)' : 'inherit' }}>{money(i.elsewhere.price)}{i.elsewhere.cheaper ? ' cheaper' : ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{i.elsewhere.supplier} · {shortDate(i.elsewhere.date)}</div>
                        </div>
                      ) : <span style={{ color: 'var(--color-text-muted)' }}>Only here</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {open && <ItemChartModal supplier={supplier} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ItemChartModal({ supplier, item, onClose }: { supplier: SupplierCard; item: SupplierItem; onClose: () => void }) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  // This shop's line comes with the item, from its order lines. Every
  // shop's line is the recorded price history, fetched only when asked.
  const q = useQuery({
    queryKey: ['purchasing', 'price-changes', item.item_id],
    queryFn: () => fetchItemPriceHistory(item.item_id),
    enabled: scope === 'all',
  });
  const mine = item.points
    .filter((p): p is typeof p & { date: string } => !!p.date)
    .map((p) => ({ date: p.date, price: p.price, supplier: supplier.name, brand: p.brand, purchase_number: p.purchase_number }));
  const points = scope === 'mine' ? mine : (q.data?.points ?? []);

  return (
    <Modal title={`${item.name} — price per ${item.unit}`} onClose={onClose} maxWidth={720}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <Btn small variant={scope === 'mine' ? 'primary' : 'secondary'} onClick={() => setScope('mine')}>{supplier.name} only</Btn>
        <Btn small variant={scope === 'all' ? 'primary' : 'secondary'} onClick={() => setScope('all')}>Every supplier</Btn>
      </div>
      {scope === 'all' && q.isLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p> : <PriceHistoryChart points={points} unit={item.unit} />}
      {points.length > 0 && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={TH}>Date</th><th style={TH}>Price</th><th style={TH}>Supplier</th><th style={TH}>Brand</th><th style={TH}>PO</th></tr></thead>
            <tbody>
              {[...points].reverse().map((p, i) => (
                <tr key={i}>
                  <td style={TD}>{p.date}</td><td style={{ ...TD, fontWeight: 600 }}>{money(p.price)}</td>
                  <td style={TD}>{p.supplier ?? '—'}</td><td style={TD}>{p.brand ?? '—'}</td>
                  <td style={TD}>{p.purchase_number ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ModalActions><Btn variant="secondary" onClick={onClose}>Close</Btn></ModalActions>
    </Modal>
  );
}

// ── Ratings ─────────────────────────────────────────────────────────────

type ScoreField = 'quality_score' | 'delivery_score' | 'accuracy_score' | 'price_score';

function RatingsTab({ supplier }: { supplier: SupplierCard }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['purchasing', 'supplier', supplier.id, 'ratings'], queryFn: () => fetchSupplierRatings(supplier.id) });
  const [form, setForm] = useState<Record<ScoreField, number> & { notes: string }>({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await rateSupplier(supplier.id, form);
      setForm({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
      await qc.invalidateQueries({ queryKey: ['purchasing', 'supplier', supplier.id] });
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const Score = ({ label, field }: { label: string; field: ScoreField }) => (
    <div>
      <div style={cellLabel}>{label}</div>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={form[field] === n} aria-label={`${label} ${n}`} onClick={() => setForm((f) => ({ ...f, [field]: n }))}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, color: n <= form[field] ? 'var(--color-warning)' : 'var(--color-border)' }}>
            <Star size={20} fill={n <= form[field] ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );

  const rows = q.data?.data ?? [];
  return (
    <div data-testid="supplier-ratings">
      <Card style={{ marginBottom: 14 }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rate this supplier</p>
        {error && <p style={{ color: 'var(--color-danger-strong)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
          <Score label="Quality" field="quality_score" />
          <Score label="Delivery" field="delivery_score" />
          <Score label="Accuracy" field="accuracy_score" />
          <Score label="Price" field="price_score" />
        </div>
        <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything worth remembering (optional)" aria-label="Rating notes" rows={2}
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1.5px solid var(--color-border)', borderRadius: 10, fontFamily: 'inherit', fontSize: 13, marginBottom: 8 }} />
        <Btn small onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Submit rating'}</Btn>
      </Card>

      {q.isLoading ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
        : rows.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No ratings yet.</p>
        : (
          <div style={{ overflowX: 'auto', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Date</th><th style={TH}>Overall</th><th style={TH}>Quality</th><th style={TH}>Delivery</th><th style={TH}>Accuracy</th><th style={TH}>Price</th><th style={TH}>By</th><th style={TH}>Notes</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={TD}>{shortDate(r.created_at)}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{Number(r.overall).toFixed(1)}</td>
                    <td style={TD}>{r.quality_score}</td><td style={TD}>{r.delivery_score}</td><td style={TD}>{r.accuracy_score}</td><td style={TD}>{r.price_score}</td>
                    <td style={TD}>{r.rated_by ?? '—'}</td>
                    <td style={TD}>{r.notes ?? '—'}{r.purchase ? <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}> · {r.purchase.number}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ── Details ─────────────────────────────────────────────────────────────

function DetailsTab({ supplier, canEdit }: { supplier: SupplierCard; canEdit: boolean }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(supplier.notes ?? '');
  const [terms, setTerms] = useState(supplier.payment_terms ?? '');
  const [lead, setLead] = useState(supplier.lead_days != null ? String(supplier.lead_days) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = notes !== (supplier.notes ?? '') || terms !== (supplier.payment_terms ?? '') || lead !== (supplier.lead_days != null ? String(supplier.lead_days) : '');

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await updateSupplier(supplier.id, { notes: notes.trim() || null, payment_terms: terms.trim() || null, lead_days: lead.trim() === '' ? null : Number(lead) });
      await qc.invalidateQueries({ queryKey: ['purchasing', 'supplier', supplier.id] });
      setMsg('Saved.');
    } catch (e) { setMsg((e as Error).message); }
    finally { setSaving(false); }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}>
      <div style={{ ...cellLabel, width: 120, flexShrink: 0, paddingTop: 2 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{value ?? <span style={{ color: 'var(--color-text-muted)' }}>—</span>}</div>
    </div>
  );

  return (
    <div data-testid="supplier-details" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, maxWidth: 720 }}>
      <Card>
        {row('Contact', supplier.contact_name)}
        {row('Phones', [supplier.phone, ...supplier.extra_phones].filter(Boolean).join(' · ') || null)}
        {row('Email', supplier.email)}
        {row('Address', supplier.address)}
        {row('TIN', supplier.tin)}
        {row('Bank', supplier.bank_account_number ? `${supplier.bank_account_number} · ${[supplier.bank_name, supplier.bank_account_name].filter(Boolean).join(' · ')}` : null)}
      </Card>
      <Card>
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>How they work</p>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="sup-terms">Payment terms</label>
        <input id="sup-terms" value={terms} onChange={(e) => setTerms(e.target.value)} disabled={!canEdit} placeholder="Cash on delivery, 30 days…" style={{ ...selectStyle, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="sup-lead">Days from order to delivery</label>
        <input id="sup-lead" type="number" min={0} max={365} value={lead} onChange={(e) => setLead(e.target.value)} disabled={!canEdit} style={{ ...selectStyle, width: 120, marginBottom: 10 }} />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }} htmlFor="sup-notes">Notes</label>
        <textarea id="sup-notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} rows={4} placeholder="Closed Fridays, delivers after 2pm, ask for Ali…"
          style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1.5px solid var(--color-border)', borderRadius: 10, fontFamily: 'inherit', fontSize: 13, marginBottom: 8 }} />
        {canEdit && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Btn small onClick={() => void save()} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</Btn>
            {msg && <span style={{ fontSize: 12, color: msg === 'Saved.' ? 'var(--color-success-strong)' : 'var(--color-danger-strong)' }}>{msg}</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
