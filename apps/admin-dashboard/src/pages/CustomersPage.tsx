import { useEffect, useRef, useState } from 'react';
import {
  fetchAdminCustomers, getAdminCustomer, updateAdminCustomer, deleteAdminCustomer,
  type AdminCustomer, type Order,
} from '../api';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions,
  PageHeader, Spinner, TableCard, TD, TH,
  ConfirmDialog, useConfirmDialog,
} from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const TIER_COLOR: Record<string, string> = {
  bronze: 'orange', silver: 'gray', gold: 'green', platinum: 'blue',
};

export function CustomersPage() {
  usePageTitle('Customers');

  const [customers, setCustomers]   = useState<AdminCustomer[]>([]);
  const [meta, setMeta]             = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);

  const [selected, setSelected]          = useState<AdminCustomer | null>(null);
  const [detail, setDetail]              = useState<{ customer: AdminCustomer; orders: Order[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing]            = useState(false);
  const [saving, setSaving]              = useState(false);
  const [saveError, setSaveError]        = useState('');
  const [form, setForm] = useState({
    name: '', email: '', internal_notes: '', is_active: true, sms_opt_out: false,
  });

  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (s: string, p: number) => {
    setLoading(true); setError('');
    try {
      const res = await fetchAdminCustomers({ search: s || undefined, page: p });
      setCustomers(res.data);
      setMeta(res.meta);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(search, page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(v, 1), 400);
  };

  const openDetail = async (c: AdminCustomer) => {
    setSelected(c);
    setEditing(false);
    setSaveError('');
    setDetailLoading(true);
    try {
      const res = await getAdminCustomer(c.id);
      setDetail(res);
      setForm({
        name: res.customer.name ?? '',
        email: res.customer.email ?? '',
        internal_notes: res.customer.internal_notes ?? '',
        is_active: res.customer.is_active,
        sms_opt_out: res.customer.sms_opt_out,
      });
    } catch (e) { setError((e as Error).message); }
    finally { setDetailLoading(false); }
  };

  const closeDetail = () => { setSelected(null); setDetail(null); setEditing(false); };

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
    width: '100%', padding: '8px 10px', border: '1.5px solid #E8E0D8',
    borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: '#1C1408', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ConfirmDialog state={dlg} close={closeDlg} />

      <PageHeader title="Customers" subtitle={`${meta.total} registered customers`} />

      {error && <ErrorMsg message={error} />}

      {/* Search bar */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, maxWidth: 320 }}
            placeholder="Search name, phone or email…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <span style={{ fontSize: 13, color: '#8B7355' }}>{meta.total} total</span>
        </div>
      </Card>

      {/* Table */}
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Customer</th>
              <th style={TH}>Phone</th>
              <th style={TH}>Tier</th>
              <th style={TH}>Orders</th>
              <th style={TH}>Last Order</th>
              <th style={TH}>Status</th>
              <th style={TH}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center' }}><Spinner /></td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40 }}><EmptyState message="No customers found" /></td></tr>
            ) : customers.map((c) => (
              <tr
                key={c.id}
                onClick={() => void openDetail(c)}
                style={{ cursor: 'pointer', borderTop: '1px solid #F0EBE3' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAF7F3'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
              >
                <td style={TD}>
                  <div style={{ fontWeight: 600, color: '#1C1408' }}>{c.name ?? '—'}</div>
                  {c.email && <div style={{ fontSize: 11, color: '#8B7355' }}>{c.email}</div>}
                </td>
                <td style={TD}>{c.phone}</td>
                <td style={TD}>
                  {c.tier
                    ? <Badge color={TIER_COLOR[c.tier] ?? 'gray'}>{c.tier}</Badge>
                    : <span style={{ color: '#9C8E7E', fontSize: 12 }}>—</span>}
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

        {meta.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0', borderTop: '1px solid #F0EBE3' }}>
            <Btn small variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</Btn>
            <span style={{ fontSize: 13, color: '#6B5D4F', alignSelf: 'center' }}>Page {page} of {meta.last_page}</span>
            <Btn small variant="secondary" onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))} disabled={page >= meta.last_page}>Next →</Btn>
          </div>
        )}
      </TableCard>

      {/* Detail / Edit modal */}
      {selected && (
        <Modal title={detail?.customer.name ?? detail?.customer.phone ?? 'Customer'} onClose={closeDetail}>
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
          ) : detail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {!editing ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {([
                    ['Phone', detail.customer.phone],
                    ['Email', detail.customer.email ?? '—'],
                    ['Tier', detail.customer.tier ?? '—'],
                    ['Loyalty points', String(detail.customer.loyalty_points)],
                    ['Orders', String(detail.customer.orders_count)],
                    ['Last login', fmtDateTime(detail.customer.last_login_at)],
                    ['Last order', fmtDateTime(detail.customer.last_order_at)],
                    ['Joined', fmtDate(detail.customer.created_at)],
                    ['SMS opt-out', detail.customer.sms_opt_out ? 'Yes' : 'No'],
                    ['Status', detail.customer.is_active ? 'Active' : 'Inactive'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <p style={{ color: '#8B7355', margin: '0 0 2px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                      <p style={{ color: '#1C1408', margin: 0, fontWeight: 500, fontSize: 13 }}>{value}</p>
                    </div>
                  ))}
                  {detail.customer.internal_notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ color: '#8B7355', margin: '0 0 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internal Notes</p>
                      <p style={{ color: '#1C1408', margin: 0, background: '#FAF7F3', padding: '8px 10px', borderRadius: 8, fontSize: 13 }}>{detail.customer.internal_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {saveError && <ErrorMsg message={saveError} />}
                  {(['name', 'email'] as const).map((key) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'capitalize' }}>{key}</label>
                      <input
                        style={inputStyle}
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Internal Notes</label>
                    <textarea
                      style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                      value={form.internal_notes}
                      onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    {([['Active', 'is_active'], ['SMS opt-out', 'sms_opt_out']] as [string, 'is_active' | 'sms_opt_out'][]).map(([label, key]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={form[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {detail.orders.length > 0 && (
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#1C1408', margin: '0 0 10px' }}>Recent Orders</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detail.orders.map((o) => (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '8px 10px', background: '#FAF7F3', borderRadius: 8 }}>
                        <span style={{ fontWeight: 600 }}>#{o.order_number}</span>
                        <span style={{ color: '#8B7355' }}>{o.type}</span>
                        <Badge color={['completed', 'paid'].includes(o.status) ? 'green' : o.status === 'cancelled' ? 'red' : 'gray'}>{o.status}</Badge>
                        <span style={{ fontWeight: 600 }}>MVR {parseFloat(String(o.total)).toFixed(2)}</span>
                        <span style={{ color: '#9C8E7E', fontSize: 11 }}>{fmtDate(o.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <ModalActions>
            {!editing ? (
              <>
                <Btn variant="secondary" onClick={() => setEditing(true)}>Edit</Btn>
                <Btn variant="danger" onClick={() => detail && handleDelete(detail.customer)}>Deactivate</Btn>
                <Btn onClick={closeDetail}>Close</Btn>
              </>
            ) : (
              <>
                <Btn variant="secondary" onClick={() => { setEditing(false); setSaveError(''); }}>Cancel</Btn>
                <Btn onClick={() => void handleSave()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
              </>
            )}
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}

export default CustomersPage;
