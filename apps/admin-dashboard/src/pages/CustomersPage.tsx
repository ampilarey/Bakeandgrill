import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  fetchAdminCustomers, getAdminCustomer, updateAdminCustomer, deleteAdminCustomer,
  changeAdminCustomerPhone, mergeAdminCustomers,
  fetchCustomerGrowthSummary, fetchCustomerSegments,
  type AdminCustomer, type Order, type CustomerSegmentMeta,
} from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, TableSkeleton, TableStateBar,
  PageHeader, PageShell, Spinner, TableCard, TD, TH, Modal, ModalActions, Input,
  ConfirmDialog, useConfirmDialog,
} from '../components/SharedUI';
import { CustomerCreditSection } from '../components/CustomerCreditSection';
import { Customer360Drawer, BADGE_MAP } from '../components/Customer360Drawer';
import { usePageTitle } from '../hooks/usePageTitle';

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TIER_COLOR: Record<string, string> = {
  bronze: 'orange', silver: 'gray', gold: 'green', platinum: 'blue',
};

export function CustomersPage() {
  usePageTitle('Customers');
  const [searchParams] = useSearchParams();
  const openedCustomerId = useRef<string | null>(null);

  const [customers, setCustomers]   = useState<AdminCustomer[]>([]);
  const [meta, setMeta]             = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [segmentFilter, setSegmentFilter] = useState('');
  const [activeFilter, setActiveFilter]   = useState<'all' | 'active' | 'inactive'>('all');
  const [segments, setSegments]     = useState<CustomerSegmentMeta[]>([]);
  const [paidSpend, setPaidSpend]   = useState<number | null>(null);
  const [view360Id, setView360Id]   = useState<number | null>(null);

  const [selected, setSelected]          = useState<AdminCustomer | null>(null);
  const [detail, setDetail]              = useState<{ customer: AdminCustomer; orders: Order[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing]            = useState(false);
  const [saving, setSaving]              = useState(false);
  const [saveError, setSaveError]        = useState('');
  const [form, setForm] = useState({
    name: '', email: '', internal_notes: '', is_active: true, sms_opt_out: false,
    tin: '', billing_address: '', is_gst_registered: false,
  });

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeResults, setMergeResults] = useState<AdminCustomer[]>([]);
  const [mergeSelected, setMergeSelected] = useState<AdminCustomer[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeError, setMergeError] = useState('');

  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (s: string, p: number, segment: string, active: typeof activeFilter) => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminCustomers({
        search: s || undefined,
        page: p,
        segment: segment || undefined,
        is_active: active === 'all' ? undefined : active === 'active',
      });
      setCustomers(res.data ?? []);
      setMeta(res.meta ?? { current_page: 1, last_page: 1, total: 0 });
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchCustomerSegments()
      .then((r) => setSegments(r.segments ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { void load(search, page, segmentFilter, activeFilter); }, [page, segmentFilter, activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(v, 1, segmentFilter, activeFilter), 400);
  };

  const openDetail = async (c: AdminCustomer) => {
    setSelected(c);
    setEditing(false);
    setSaveError('');
    setPaidSpend(null);
    setDetailLoading(true);
    try {
      const [res, growth] = await Promise.all([
        getAdminCustomer(c.id),
        fetchCustomerGrowthSummary(c.id).catch(() => null),
      ]);
      setDetail(res);
      if (growth?.summary?.lifetime) {
        setPaidSpend(growth.summary.lifetime.total_paid_spend);
      }
      setForm({
        name: res.customer.name ?? '',
        email: res.customer.email ?? '',
        internal_notes: res.customer.internal_notes ?? '',
        is_active: res.customer.is_active,
        sms_opt_out: res.customer.sms_opt_out,
        tin: res.customer.tin ?? '',
        billing_address: res.customer.billing_address ?? '',
        is_gst_registered: res.customer.is_gst_registered ?? false,
      });
    } catch (e) { setError((e as Error).message); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => {
    const customerId = searchParams.get('customer');
    if (!customerId || openedCustomerId.current === customerId) return;
    openedCustomerId.current = customerId;
    const id = Number(customerId);
    if (!Number.isFinite(id)) return;
    void openDetail({ id } as AdminCustomer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
    setPaidSpend(null);
    setEditing(false);
    setPhoneModalOpen(false);
    setMergeModalOpen(false);
    setMergeSelected([]);
    setMergeSearch('');
    setMergeResults([]);
  };

  const openPhoneModal = () => {
    setNewPhone('');
    setPhoneError('');
    setPhoneModalOpen(true);
  };

  const handleChangePhone = async () => {
    if (!detail || !newPhone.trim()) {
      setPhoneError('Enter the new phone number.');
      return;
    }
    setPhoneSaving(true);
    setPhoneError('');
    try {
      const res = await changeAdminCustomerPhone(detail.customer.id, newPhone.trim());
      setDetail({ ...detail, customer: res.customer });
      setCustomers((prev) => prev.map((c) => c.id === res.customer.id ? res.customer : c));
      if (selected) setSelected(res.customer);
      setPhoneModalOpen(false);
    } catch (e) {
      setPhoneError((e as Error).message);
    } finally {
      setPhoneSaving(false);
    }
  };

  const searchMergeCandidates = async (q: string) => {
    setMergeSearch(q);
    if (q.trim().length < 2) {
      setMergeResults([]);
      return;
    }
    setMergeSearching(true);
    try {
      const res = await fetchAdminCustomers({ search: q.trim(), page: 1 });
      const primaryId = detail?.customer.id;
      setMergeResults((res.data ?? []).filter((c) => c.id !== primaryId));
    } catch (e) {
      setMergeError((e as Error).message);
    } finally {
      setMergeSearching(false);
    }
  };

  const toggleMergeCandidate = (c: AdminCustomer) => {
    setMergeSelected((prev) =>
      prev.some((x) => x.id === c.id) ? prev.filter((x) => x.id !== c.id) : [...prev, c],
    );
  };

  const handleMerge = () => {
    if (!detail || mergeSelected.length === 0) return;
    const names = mergeSelected.map((c) => `#${c.id} ${c.phone}`).join(', ');
    ask({
      title: 'Merge Accounts',
      message: `Merge ${names} into ${detail.customer.name ?? detail.customer.phone}? Orders, loyalty, and history move to this account. Source accounts are deactivated.`,
      confirmLabel: 'Merge Accounts',
      danger: true,
      onConfirm: async () => {
        setMergeSaving(true);
        setMergeError('');
        try {
          const res = await mergeAdminCustomers(
            detail.customer.id,
            mergeSelected.map((c) => c.id),
          );
          const refreshed = await getAdminCustomer(res.customer.id);
          setDetail(refreshed);
          setCustomers((prev) => prev.map((c) => c.id === res.customer.id ? res.customer : c).filter(
            (c) => !mergeSelected.some((m) => m.id === c.id),
          ));
          if (selected) setSelected(res.customer);
          setMergeModalOpen(false);
          setMergeSelected([]);
          setMergeSearch('');
          setMergeResults([]);
          void load(search, page, segmentFilter, activeFilter);
        } catch (e) {
          setMergeError((e as Error).message);
        } finally {
          setMergeSaving(false);
        }
      },
    });
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true); setSaveError('');
    try {
      const res = await updateAdminCustomer(detail.customer.id, {
        name: form.name || undefined,
        email: form.email || undefined,
        internal_notes: form.internal_notes,
        is_active: form.is_active,
        sms_opt_out: form.sms_opt_out,
        tin: form.tin || undefined,
        billing_address: form.billing_address || undefined,
        is_gst_registered: form.is_gst_registered,
      });
      setDetail({ ...detail, customer: res.customer });
      setCustomers((prev) => prev.map((c) => c.id === res.customer.id ? res.customer : c));
      setEditing(false);
    } catch (e) { setSaveError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = (c: AdminCustomer) => {
    ask({
      title: 'Deactivate Customer',
      message: `Deactivate ${c.name ?? c.phone}? Their account will be soft-deleted. Past orders stay linked.`,
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteAdminCustomer(c.id);
          setCustomers((prev) => prev.filter((x) => x.id !== c.id));
          setMeta((m) => ({ ...m, total: m.total - 1 }));
          closeDetail();
        } catch (e) { setError((e as Error).message); }
      },
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)',
    borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: 'var(--color-text)', boxSizing: 'border-box',
  };

  return (
    <PageShell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ConfirmDialog state={dlg} close={closeDlg} />

      <PageHeader section="Customers & Marketing"
        title="Customers"
        subtitle={`${meta.total} registered customers`}
        action={
          <Link to="/customers/growth" style={{ fontSize: 14, color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
            Growth dashboard →
          </Link>
        }
      />

      <TableStateBar error={error} onRetry={() => void load(search, page, segmentFilter, activeFilter)} />

      {/* Search bar */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, maxWidth: 320 }}
            placeholder="Search name, phone or email…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <select
            style={{ ...inputStyle, maxWidth: 200 }}
            value={segmentFilter}
            onChange={(e) => { setSegmentFilter(e.target.value); setPage(1); }}
          >
            <option value="">All segments</option>
            {segments.map((s) => (
              <option key={s.slug} value={s.slug}>{s.label} ({s.count})</option>
            ))}
          </select>
          <select
            style={{ ...inputStyle, maxWidth: 140 }}
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value as typeof activeFilter); setPage(1); }}
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span style={{ fontSize: 13, color: '#8B7355' }}>{meta.total} total</span>
        </div>
      </Card>

      {/* Table */}
      <TableCard stickyHead>
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : customers.length === 0 ? (
          <EmptyState message="No customers found" />
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Customer</th>
              <th style={TH}>Phone</th>
              <th style={TH}>Badges</th>
              <th style={TH}>Tier</th>
              <th style={TH}>Orders</th>
              <th style={TH}>Last Order</th>
              <th style={TH}>Status</th>
              <th style={TH}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                role="button"
                onClick={() => void openDetail(c)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openDetail(c); } }}
                style={{ cursor: 'pointer', borderTop: '1px solid #F0EBE3' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAF7F3'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
              >
                <td style={TD}>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{c.name ?? '—'}</div>
                  {c.email && <div style={{ fontSize: 11, color: '#8B7355' }}>{c.email}</div>}
                </td>
                <td style={TD}>{c.phone}</td>
                <td style={TD}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(c.badges ?? []).length === 0 ? (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>
                    ) : (c.badges ?? []).map((b) => {
                      const meta = BADGE_MAP[b];
                      return meta
                        ? <Badge key={b} color={meta.color}>{meta.label}</Badge>
                        : <Badge key={b} color="gray">{b}</Badge>;
                    })}
                  </div>
                </td>
                <td style={TD}>
                  {c.tier
                    ? <Badge color={TIER_COLOR[c.tier] ?? 'gray'}>{c.tier}</Badge>
                    : <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>—</span>}
                </td>
                <td style={TD}>{c.orders_count}</td>
                <td style={TD}>{fmtDate(c.last_order_at)}</td>
                <td style={TD}>
                  <Badge color={c.is_active ? 'green' : 'red'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td style={TD}>{fmtDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}

        {!loading && meta.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0', borderTop: '1px solid #F0EBE3' }}>
            <Btn small variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</Btn>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', alignSelf: 'center' }}>Page {page} of {meta.last_page}</span>
            <Btn small variant="secondary" onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))} disabled={page >= meta.last_page}>Next →</Btn>
          </div>
        )}
      </TableCard>

      {/* Customer detail — slide-in side panel */}
      {selected && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeDetail}
            style={{ position: 'fixed', inset: 0, background: 'rgba(28,20,8,0.35)', zIndex: 40, backdropFilter: 'blur(2px)' }}
          />
          {/* Drawer */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
            width: 'min(480px, 100vw)',
            background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0EAE3', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(212,129,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, color: 'var(--color-primary)', flexShrink: 0 }}>
                {(detail?.customer.name ?? selected.name ?? '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {detail?.customer.name ?? selected.name ?? selected.phone}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>{selected.phone}</p>
              </div>
              <button onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, borderRadius: 8, display: 'flex' }}>
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><Spinner /></div>
            ) : detail ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* KPI strip */}
                <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Total Orders', value: String(detail.customer.orders_count) },
                    { label: 'Loyalty Pts', value: String(detail.customer.loyalty_points ?? 0) },
                    { label: 'Total Spend', value: paidSpend != null ? `MVR ${paidSpend.toFixed(2)}` : '…' },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: '#FAF7F3', border: '1px solid #F0EAE3', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-primary)' }}>{value}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* Info grid */}
                {!editing ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {([
                        ['Phone', detail.customer.phone],
                        ['Email', detail.customer.email ?? '—'],
                        ['Tier', detail.customer.tier ?? '—'],
                        ['Joined', fmtDate(detail.customer.created_at)],
                        ['Last Order', fmtDate(detail.customer.last_order_at)],
                        ['Status', detail.customer.is_active ? 'Active' : 'Inactive'],
                        ['SMS Opt-out', detail.customer.sms_opt_out ? 'Yes' : 'No'],
                        ['Last Login', fmtDate(detail.customer.last_login_at)],
                        ['TIN', detail.customer.tin ?? '—'],
                        ['GST Registered', detail.customer.is_gst_registered ? 'Yes' : 'No'],
                      ] as [string, string][]).map(([label, value]) => (
                        <div key={label} style={{ background: '#FAF7F3', borderRadius: 8, padding: '8px 10px' }}>
                          <p style={{ color: 'var(--color-text-muted)', margin: '0 0 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                          <p style={{ color: 'var(--color-text)', margin: 0, fontWeight: 600, fontSize: 13 }}>{value}</p>
                        </div>
                      ))}
                    </div>
                    {detail.customer.internal_notes && (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 14px' }}>
                        <p style={{ color: '#92400E', margin: '0 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📝 Internal Notes</p>
                        <p style={{ color: '#78350F', margin: 0, fontSize: 13 }}>{detail.customer.internal_notes}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {saveError && <ErrorMsg message={saveError} />}
                    {(['name', 'email', 'tin', 'billing_address'] as const).map((key) => (
                      <div key={key}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, textTransform: key === 'tin' ? 'uppercase' : 'capitalize' }}>{key === 'billing_address' ? 'Billing address' : key === 'tin' ? 'TIN' : key}</label>
                        {key === 'billing_address' ? (
                          <textarea style={{ ...inputStyle, height: 60, resize: 'vertical' }} value={form.billing_address} onChange={(e) => setForm((f) => ({ ...f, billing_address: e.target.value }))} />
                        ) : (
                          <input style={inputStyle} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                        )}
                      </div>
                    ))}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={form.is_gst_registered} onChange={(e) => setForm((f) => ({ ...f, is_gst_registered: e.target.checked }))} />
                      GST registered (B2B tax invoices)
                    </label>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Internal Notes</label>
                      <textarea style={{ ...inputStyle, height: 80, resize: 'vertical' }} value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 20 }}>
                      {([['Active', 'is_active'], ['SMS opt-out', 'sms_opt_out']] as [string, 'is_active' | 'sms_opt_out'][]).map(([label, key]) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {detail && !editing && (
                  <CustomerCreditSection customerId={detail.customer.id} />
                )}

                {!editing && detail && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, padding: '14px 16px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Account Identity
                    </p>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>
                      Phone is the login identity. Change it here if the customer got a new SIM, or merge duplicate accounts into this one.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn small variant="secondary" onClick={openPhoneModal}>Change Phone</Btn>
                      <Btn small variant="secondary" onClick={() => { setMergeError(''); setMergeModalOpen(true); }}>Merge Accounts</Btn>
                    </div>
                  </div>
                )}

                {/* Order history */}
                {(detail.orders ?? []).length > 0 && (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order History</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(detail.orders ?? []).map((o) => (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '10px 12px', background: '#FAF7F3', borderRadius: 10, border: '1px solid #F0EAE3' }}>
                          <Link to={`/orders?order=${o.id}`} style={{ fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}>#{o.order_number}</Link>
                          <span style={{ color: '#8B7355', fontSize: 12 }}>{o.type?.replace('_', ' ')}</span>
                          <Badge color={['completed', 'paid'].includes(o.status) ? 'green' : o.status === 'cancelled' ? 'red' : 'gray'}>{o.status}</Badge>
                          <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>MVR {parseFloat(String(o.total)).toFixed(2)}</span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{fmtDate(o.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Footer actions */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #F0EAE3', display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              {!editing ? (
                <>
                  <Btn variant="secondary" onClick={() => setEditing(true)}>Edit</Btn>
                  <Btn variant="secondary" onClick={() => detail && setView360Id(detail.customer.id)}>View Customer 360</Btn>
                  <Btn variant="danger" onClick={() => detail && handleDelete(detail.customer)}>Deactivate</Btn>
                  <div style={{ flex: 1 }} />
                  <Btn onClick={closeDetail}>Close</Btn>
                </>
              ) : (
                <>
                  <Btn variant="secondary" onClick={() => { setEditing(false); setSaveError(''); }}>Cancel</Btn>
                  <Btn onClick={() => void handleSave()} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {view360Id != null && (
        <Customer360Drawer customerId={view360Id} onClose={() => setView360Id(null)} />
      )}

      {phoneModalOpen && (
      <Modal onClose={() => setPhoneModalOpen(false)} title="Change Phone Number">
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Current: <strong>{detail?.customer.phone}</strong>. The customer will need to log in again with the new number.
        </p>
        {phoneError && <ErrorMsg message={phoneError} />}
        <Input label="New phone number" placeholder="e.g. 7972434 or +9607972434" value={newPhone} onChange={setNewPhone} />
        <ModalActions>
          <Btn variant="secondary" onClick={() => setPhoneModalOpen(false)}>Cancel</Btn>
          <Btn onClick={() => void handleChangePhone()} disabled={phoneSaving || !newPhone.trim()}>
            {phoneSaving ? 'Saving…' : 'Update Phone'}
          </Btn>
        </ModalActions>
      </Modal>
      )}

      {mergeModalOpen && (
      <Modal onClose={() => setMergeModalOpen(false)} title="Merge Accounts Into This Customer">
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Primary account: <strong>{detail?.customer.name ?? detail?.customer.phone}</strong> (#{detail?.customer.id}).
          Search for duplicate accounts to absorb their orders, loyalty, and history.
        </p>
        {mergeError && <ErrorMsg message={mergeError} />}
        <Input
          label="Search duplicate accounts"
          placeholder="Name, phone, or email…"
          value={mergeSearch}
          onChange={(v) => void searchMergeCandidates(v)}
        />
        {mergeSearching && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0' }}>Searching…</p>}
        {mergeResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
            {mergeResults.map((c) => {
              const picked = mergeSelected.some((x) => x.id === c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleMergeCandidate(c)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: picked ? '2px solid var(--color-primary)' : '1px solid #F0EAE3',
                    background: picked ? '#FFF7ED' : '#FAF7F3',
                  }}
                >
                  <span>
                    <strong>{c.name ?? '—'}</strong>
                    <span style={{ display: 'block', fontSize: 12, color: '#8B7355' }}>{c.phone}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.orders_count} orders</span>
                </button>
              );
            })}
          </div>
        )}
        {mergeSelected.length > 0 && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: '#92400E' }}>
            Selected: {mergeSelected.map((c) => `#${c.id}`).join(', ')}
          </p>
        )}
        <ModalActions>
          <Btn variant="secondary" onClick={() => setMergeModalOpen(false)}>Cancel</Btn>
          <Btn variant="danger" onClick={handleMerge} disabled={mergeSaving || mergeSelected.length === 0}>
            {mergeSaving ? 'Merging…' : `Merge ${mergeSelected.length || ''} Account${mergeSelected.length === 1 ? '' : 's'}`}
          </Btn>
        </ModalActions>
      </Modal>
      )}
    </div>

    </PageShell>
  );
}

export default CustomersPage;
