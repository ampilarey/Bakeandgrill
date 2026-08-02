import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchOrders, getDriverSettlementReport, type Order, type DriverSettlementReport, adminRequest } from '../api';
import { Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, PageHeader, PageShell, Spinner, StatCard, statColor, useConfirmDialog } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';
import { today, daysAgo } from '../utils/dateHelpers';

type Driver = {
  id: number;
  name: string;
  phone?: string | null;
  is_active: boolean;
  vehicle_type?: string | null;
  has_pin?: boolean;
  last_login_at?: string | null;
};

type DriverLocation = {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
  driver?: { name: string; phone: string } | null;
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function DeliveryPage() {
  usePageTitle('Delivery');
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [tab, setTab] = useState<'orders' | 'drivers' | 'settlement'>('orders');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [settlementFrom, setSettlementFrom] = useState(() => daysAgo(7));
  const [settlementTo, setSettlementTo] = useState(() => today());
  const [settlement, setSettlement] = useState<DriverSettlementReport | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);

  const loadOrders = async (p = page) => {
    try {
      const res = await fetchOrders({ type: 'delivery', page: p, per_page: 30 });
      setOrders(res.data ?? []);
      setLastPage(res.meta?.last_page ?? (res as unknown as { last_page?: number }).last_page ?? 1);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDrivers = async () => {
    try {
      const res = await adminRequest<{ drivers: Driver[] }>('/delivery/drivers');
      setDrivers(res.drivers ?? []);
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const loadSettlement = useCallback(async () => {
    setSettlementLoading(true);
    try {
      setSettlement(await getDriverSettlementReport({ from: settlementFrom, to: settlementTo }));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSettlementLoading(false);
    }
  }, [settlementFrom, settlementTo]);

  useEffect(() => {
    void loadOrders(page);
    void loadDrivers();
    const t = setInterval(() => void loadOrders(page), 30_000);
    return () => clearInterval(t);
  }, [page]);

  useEffect(() => {
    if (tab === 'settlement') void loadSettlement();
  }, [tab, loadSettlement]);

  const active   = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const finished = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));

  return (
    <PageShell>
    <>
      <PageHeader section="Monitor"
        title="Delivery Orders"
        subtitle="Manage delivery orders and assign drivers"
        action={<Btn onClick={() => void loadOrders(page)} variant="secondary">↻ Refresh</Btn>}
      />

      {/* Tab switcher */}
      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['orders', 'drivers', 'settlement'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: 10, border: '1.5px solid',
              borderColor: tab === t ? 'var(--color-primary)' : '#e5e7eb',
              background: tab === t ? 'var(--color-primary)' : 'white',
              color: tab === t ? 'white' : '#374151',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t === 'orders' ? `Orders (${orders.length})` : t === 'drivers' ? `Drivers (${drivers.length})` : 'Driver Settlement'}
          </button>
        ))}
      </div>

      {error && <ErrorMsg message={error} />}

      {tab === 'orders' && (
        loading && orders.length === 0 ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <Card><EmptyState message="No delivery orders yet." /></Card>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  ACTIVE ({active.length})
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
                  {active.map((o) => (
                    <DeliveryCard key={o.id} order={o} drivers={drivers} onSelect={setSelected} onDriverAssigned={() => void loadOrders(page)} />
                  ))}
                </div>
              </>
            )}

            {finished.length > 0 && (
              <>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  COMPLETED ({finished.length})
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {finished.map((o) => (
                    <DeliveryCard key={o.id} order={o} drivers={drivers} onSelect={setSelected} onDriverAssigned={() => void loadOrders(page)} />
                  ))}
                </div>
              </>
            )}

            {lastPage > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                <Btn variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Btn>
                <span style={{ lineHeight: '36px', fontSize: 13, color: '#6b7280' }}>Page {page} / {lastPage}</span>
                <Btn variant="secondary" disabled={page >= lastPage} onClick={() => setPage(p => p + 1)}>Next →</Btn>
              </div>
            )}
          </>
        )
      )}

      {tab === 'drivers' && (
        <DriversPanel drivers={drivers} onRefresh={loadDrivers} />
      )}

      {tab === 'settlement' && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
            <label>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>From</span>
              <input type="date" value={settlementFrom} onChange={(e) => setSettlementFrom(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
            </label>
            <label>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>To</span>
              <input type="date" value={settlementTo} onChange={(e) => setSettlementTo(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)' }} />
            </label>
            {settlementLoading && (
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)', paddingBottom: 8 }}>Loading…</span>
            )}
          </div>
          {settlementLoading && !settlement ? (
            <Spinner />
          ) : settlement ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
                <StatCard label="Delivery Orders" value={String(settlement.totals.orders_count)} accent="#0ea5e9" />
                <StatCard label="Cash Collected" value={`MVR ${settlement.totals.cash_collected.toFixed(2)}`} accent="#16a34a" />
                <StatCard label="Delivery Fees" value={`MVR ${settlement.totals.delivery_fees.toFixed(2)}`} accent="var(--color-primary)" />
              </div>
              <Card>
                {(settlement.rows ?? []).length === 0 ? (
                  <EmptyState message="No driver-assigned deliveries in this period." />
                ) : (
                  <div className="table-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Driver', 'Orders', 'Completed', 'Revenue', 'Fees', 'Cash', 'Card', 'QR', 'Transfer', 'Other', 'Prepaid'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', borderBottom: '1px solid #F0EAE3' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {settlement.rows.map((row) => (
                        <tr key={row.driver_id}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{row.driver_name}</td>
                          <td style={{ padding: '10px 12px' }}>{row.orders_count}</td>
                          <td style={{ padding: '10px 12px' }}>{row.completed_count}</td>
                          <td style={{ padding: '10px 12px' }}>MVR {row.order_total.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px' }}>MVR {row.delivery_fees.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 600 }}>MVR {row.cash_collected.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px' }}>MVR {row.card_collected.toFixed(2)}</td>
                          <td style={{ padding: '10px 12px' }}>MVR {(row.qr_collected ?? 0).toFixed(2)}</td>
                          <td style={{ padding: '10px 12px' }}>MVR {(row.transfer_collected ?? 0).toFixed(2)}</td>
                          <td style={{ padding: '10px 12px' }}>MVR {(row.other_collected ?? 0).toFixed(2)}</td>
                          <td style={{ padding: '10px 12px' }}>{row.prepaid_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </>
      )}

      {/* Order detail modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setSelected(null)}
        >
          <Card style={{ width: '100%', maxWidth: 480 }}>
            <div onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>
                  <Link to={`/orders?order=${selected.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
                    #{selected.order_number}
                  </Link>
                </h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-muted)' }}>✕</button>
              </div>
              <Badge label={selected.status} color={statColor(selected.status)} />
              <div style={{ background: '#FFF8F3', borderRadius: 10, padding: 16, marginTop: 16, border: '1px solid #F0DCC8' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)', marginBottom: 8 }}>Delivery Details</p>
                <p style={{ fontSize: 14, color: 'var(--color-text)' }}>{selected.delivery_address_line1 ?? 'N/A'}</p>
                {selected.delivery_island && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{selected.delivery_island}</p>}
                {selected.delivery_contact_name && (
                  <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                    👤 {selected.delivery_contact_name} · {selected.delivery_contact_phone}
                  </p>
                )}
              </div>
              {drivers.length > 0 && !['completed', 'cancelled'].includes(selected.status) && (
                <AssignDriverInline
                  order={selected}
                  drivers={drivers}
                  onAssigned={(updated) => { setSelected(updated); void loadOrders(); }}
                />
              )}
              {selected.proof_of_delivery_path && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-primary)', marginBottom: 8 }}>Proof of delivery</p>
                  <a
                    href={`/storage/${selected.proof_of_delivery_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: '#2563eb', fontWeight: 600 }}
                  >
                    View delivery photo →
                  </a>
                </div>
              )}
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                <span>Total</span>
                <span style={{ color: 'var(--color-primary)' }}>MVR {parseFloat(String(selected.total ?? 0)).toFixed(2)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>

    </PageShell>
  );
}

// ─── Delivery Card ───────────────────────────────────────────────────────────

function DeliveryCard({
  order, drivers, onSelect, onDriverAssigned,
}: {
  order: Order; drivers: Driver[];
  onSelect: (o: Order) => void;
  onDriverAssigned: () => void;
}) {
  const urgent = order.status === 'pending' &&
    (Date.now() - new Date(order.created_at).getTime()) > 10 * 60 * 1000;

  const extOrder = order as Order & { driver?: { name: string; phone?: string }; delivery_driver_id?: number };
  const driverName = extOrder.driver?.name;
  const isActiveDelivery = ['out_for_delivery', 'picked_up', 'on_the_way'].includes(order.status);

  return (
    <Card style={{ border: urgent ? '2px solid var(--color-danger)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <Link
          to={`/orders?order=${order.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          #{order.order_number}
        </Link>
        <Badge label={(order.status ?? '').replace(/_/g, ' ')} color={statColor(order.status ?? '')} />
      </div>
      <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
        {order.delivery_address_line1 ?? '—'}
      </p>
      {order.delivery_island && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>📍 {order.delivery_island}</p>
      )}
      {order.delivery_contact_name && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>👤 {order.delivery_contact_name}</p>
      )}

      {/* Driver badge or quick assign */}
      {driverName ? (
        <div style={{ marginTop: 6 }}>
          <p style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>🛵 {driverName}</p>
          {isActiveDelivery && extOrder.delivery_driver_id && (
            <DriverLocationBadge orderId={order.id} />
          )}
        </div>
      ) : !['completed', 'cancelled'].includes(order.status) && drivers.length > 0 ? (
        <QuickAssignDriver order={order} drivers={drivers} onAssigned={onDriverAssigned} />
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{timeAgo(order.created_at)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>MVR {parseFloat(String(order.total ?? 0)).toFixed(2)}</span>
          <Btn small variant="ghost" onClick={() => onSelect(order)}>Details</Btn>
        </div>
      </div>
    </Card>
  );
}

// ─── Driver Location Badge ───────────────────────────────────────────────────

function DriverLocationBadge({ orderId }: { orderId: number }) {
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await adminRequest<{ location: DriverLocation | null }>(`/driver/deliveries/${orderId}/location`);
      setLocation(res.location);
    } catch (e: unknown) {
      console.error('Failed to load driver location', e);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>Loading location…</p>;
  if (!location) return <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>📍 Location not available</p>;

  const mapsUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
  const updatedMins = Math.floor((Date.now() - new Date(location.recorded_at).getTime()) / 60000);

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', display: 'block', marginTop: 2 }}
    >
      📍 Track live · {updatedMins < 1 ? 'just now' : `${updatedMins}m ago`}
    </a>
  );
}

// ─── Quick Assign (inline select on card) ───────────────────────────────────

function QuickAssignDriver({ order, drivers, onAssigned }: { order: Order; drivers: Driver[]; onAssigned: () => void }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleChange = async (driverId: string) => {
    if (!driverId) return;
    setSaving(true);
    setErr('');
    try {
      await adminRequest(`/delivery/orders/${order.id}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ driver_id: parseInt(driverId, 10) }),
      });
      onAssigned();
    } catch (e: unknown) {
      setErr((e as Error).message || 'Failed to assign driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {err && <p style={{ color: '#dc2626', fontSize: 12, marginBottom: 4 }}>{err}</p>}
      <select
        disabled={saving}
        defaultValue=""
        onChange={(e) => void handleChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 8,
          border: '1.5px solid #e5e7eb', fontSize: 13, color: '#374151',
          background: saving ? '#f9fafb' : 'white', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <option value="" disabled>🛵 Assign driver…</option>
        {drivers.filter((d) => d.is_active).map((d) => (
          <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ''}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Assign Driver (in detail modal) ────────────────────────────────────────

function AssignDriverInline({
  order, drivers, onAssigned,
}: {
  order: Order; drivers: Driver[];
  onAssigned: (updated: Order) => void;
}) {
  const currentDriverId = (order as Order & { delivery_driver_id?: number }).delivery_driver_id;
  const [driverId, setDriverId] = useState<string>(currentDriverId?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const res = await adminRequest<{ order: Order }>(`/delivery/orders/${order.id}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ driver_id: driverId ? parseInt(driverId, 10) : null }),
      });
      onAssigned(res.order);
    } catch (e: unknown) {
      setErr((e as Error).message || 'Failed to assign driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, background: 'var(--color-bg)', borderRadius: 10, padding: 14, border: '1.5px solid #e5e7eb' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Assign Driver</p>
      {err && <p style={{ color: '#dc2626', fontSize: 12, marginBottom: 6 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }}
        >
          <option value="">— Unassigned —</option>
          {drivers.filter((d) => d.is_active).map((d) => (
            <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>
          ))}
        </select>
        <Btn onClick={() => void save()} disabled={saving} small>
          {saving ? '…' : 'Save'}
        </Btn>
      </div>
    </div>
  );
}

// ─── Drivers Panel ───────────────────────────────────────────────────────────

type DriverForm = { name: string; phone: string; is_active: boolean; vehicle_type: string; pin: string };
const emptyForm = (): DriverForm => ({ name: '', phone: '', is_active: true, vehicle_type: '', pin: '' });

function DriversPanel({ drivers, onRefresh }: { drivers: Driver[]; onRefresh: () => void }) {
  const { state: dlg, ask: askConfirm, close: closeDlg } = useConfirmDialog();
  const [form, setForm] = useState<DriverForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        phone: form.phone || null,
        is_active: form.is_active,
        vehicle_type: form.vehicle_type || null,
      };
      if (form.pin) payload.pin = form.pin;

      if (editId !== null) {
        await adminRequest(`/delivery/drivers/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await adminRequest('/delivery/drivers', { method: 'POST', body: JSON.stringify(payload) });
      }
      setForm(emptyForm());
      setEditId(null);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    askConfirm({
      title: 'Remove Driver',
      message: 'Remove this driver? Active orders will be unassigned.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        try {
          await adminRequest(`/delivery/drivers/${id}`, { method: 'DELETE' });
          onRefresh();
        } catch (e: unknown) {
          setError((e as Error).message);
        }
      },
    });
  };

  const startEdit = (d: Driver) => {
    setEditId(d.id);
    setForm({ name: d.name, phone: d.phone ?? '', is_active: d.is_active, vehicle_type: d.vehicle_type ?? '', pin: '' });
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', minWidth: 120,
  };

  return (
    <div>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {/* Add / Edit form */}
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
          {editId !== null ? 'Edit Driver' : 'Add Driver'}
        </p>
        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ ...inputStyle, flex: 2, minWidth: 140 }}
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <select
            value={form.vehicle_type}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
            style={{ ...inputStyle, color: form.vehicle_type ? '#374151' : 'var(--color-text-muted)' }}
          >
            <option value="">Vehicle type…</option>
            <option value="bike">🚲 Bike</option>
            <option value="scooter">🛵 Scooter</option>
            <option value="motorcycle">🏍️ Motorcycle</option>
            <option value="car">🚗 Car</option>
          </select>
          <input
            placeholder={editId !== null ? 'New PIN (leave blank to keep)' : 'PIN (4-6 digits)'}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
            style={inputStyle}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : editId !== null ? 'Update' : 'Add Driver'}
          </Btn>
          {editId !== null && (
            <Btn variant="secondary" onClick={() => { setEditId(null); setForm(emptyForm()); }}>
              Cancel
            </Btn>
          )}
        </div>
      </Card>

      {/* Drivers list */}
      {drivers.length === 0 ? (
        <Card><EmptyState message="No drivers added yet." /></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {drivers.map((d) => (
            <Card key={d.id} style={{ opacity: d.is_active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{d.name}</p>
                  {d.phone && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>📞 {d.phone}</p>}
                  {d.vehicle_type && <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>🚗 {d.vehicle_type}</p>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 8px', background: d.is_active ? '#dcfce7' : 'var(--color-border-light)',
                      color: d.is_active ? '#16a34a' : 'var(--color-text-secondary)',
                      borderRadius: 99, fontSize: 11, fontWeight: 600,
                    }}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      background: d.has_pin ? '#dbeafe' : '#fef9c3',
                      color: d.has_pin ? '#1d4ed8' : '#854d0e',
                      borderRadius: 99, fontSize: 11, fontWeight: 600,
                    }}>
                      {d.has_pin ? '🔒 PIN set' : '⚠️ No PIN'}
                    </span>
                  </div>
                  {d.last_login_at && (
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      Last login: {new Date(d.last_login_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Btn small variant="ghost" onClick={() => startEdit(d)}>Edit</Btn>
                  <Btn small variant="danger" onClick={() => void handleDelete(d.id)}>Delete</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
