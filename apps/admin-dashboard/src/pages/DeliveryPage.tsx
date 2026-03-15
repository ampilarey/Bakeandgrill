import { useEffect, useState } from 'react';
import { fetchOrders, type Order, adminRequest } from '../api';
import { Badge, Btn, Card, EmptyState, ErrorMsg, PageHeader, Spinner, statColor } from '../components/Layout';
import { usePageTitle } from '../hooks/usePageTitle';

type Driver = { id: number; name: string; phone?: string | null; is_active: boolean };

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
  const [tab, setTab] = useState<'orders' | 'drivers'>('orders');

  const loadOrders = async () => {
    try {
      const res = await fetchOrders({ type: 'delivery' });
      setOrders(res.data);
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
      setDrivers(res.drivers);
    } catch { /* ignore - permission might be denied */ }
  };

  useEffect(() => {
    void loadOrders();
    void loadDrivers();
    const t = setInterval(() => void loadOrders(), 30_000);
    return () => clearInterval(t);
  }, []);

  const active   = orders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const finished = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));

  return (
    <>
      <PageHeader
        title="Delivery Orders"
        subtitle="Manage delivery orders and assign drivers"
        action={<Btn onClick={loadOrders} variant="secondary">↻ Refresh</Btn>}
      />

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['orders', 'drivers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: 10, border: '1.5px solid',
              borderColor: tab === t ? '#D4813A' : '#e5e7eb',
              background: tab === t ? '#D4813A' : 'white',
              color: tab === t ? 'white' : '#374151',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t === 'orders' ? `Orders (${orders.length})` : `Drivers (${drivers.length})`}
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
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginBottom: 12 }}>
                  ACTIVE ({active.length})
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>
                  {active.map((o) => (
                    <DeliveryCard key={o.id} order={o} drivers={drivers} onSelect={setSelected} onDriverAssigned={loadOrders} />
                  ))}
                </div>
              </>
            )}

            {finished.length > 0 && (
              <>
                <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', marginBottom: 12 }}>
                  COMPLETED ({finished.length})
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {finished.slice(0, 10).map((o) => (
                    <DeliveryCard key={o.id} order={o} drivers={drivers} onSelect={setSelected} onDriverAssigned={loadOrders} />
                  ))}
                </div>
              </>
            )}
          </>
        )
      )}

      {tab === 'drivers' && (
        <DriversPanel drivers={drivers} onRefresh={loadDrivers} />
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
                <h2 style={{ fontWeight: 800, fontSize: 18 }}>#{selected.order_number}</h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
              </div>
              <Badge label={selected.status} color={statColor(selected.status)} />
              <div style={{ background: '#FFF8F3', borderRadius: 10, padding: 16, marginTop: 16, border: '1px solid #F0DCC8' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#D4813A', marginBottom: 8 }}>Delivery Details</p>
                <p style={{ fontSize: 14, color: '#1C1408' }}>{selected.delivery_address_line1 ?? 'N/A'}</p>
                {selected.delivery_island && <p style={{ fontSize: 13, color: '#6B5D4F' }}>{selected.delivery_island}</p>}
                {selected.delivery_contact_name && (
                  <p style={{ fontSize: 13, color: '#6B5D4F', marginTop: 6 }}>
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
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 18 }}>
                <span>Total</span>
                <span style={{ color: '#D4813A' }}>MVR {parseFloat(String(selected.total ?? 0)).toFixed(2)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
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

  const driverName = (order as Order & { driver?: { name: string } }).driver?.name;

  return (
    <Card style={{ border: urgent ? '2px solid #ef4444' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>#{order.order_number}</span>
        <Badge label={order.status} color={statColor(order.status)} />
      </div>
      <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
        {order.delivery_address_line1 ?? '—'}
      </p>
      {order.delivery_island && (
        <p style={{ fontSize: 13, color: '#64748b' }}>📍 {order.delivery_island}</p>
      )}
      {order.delivery_contact_name && (
        <p style={{ fontSize: 13, color: '#64748b' }}>👤 {order.delivery_contact_name}</p>
      )}

      {/* Driver badge or quick assign */}
      {driverName ? (
        <p style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, marginTop: 6 }}>
          🛵 {driverName}
        </p>
      ) : !['completed', 'cancelled'].includes(order.status) && drivers.length > 0 ? (
        <QuickAssignDriver order={order} drivers={drivers} onAssigned={onDriverAssigned} />
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{timeAgo(order.created_at)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: '#D4813A' }}>MVR {parseFloat(String(order.total ?? 0)).toFixed(2)}</span>
          <Btn small variant="ghost" onClick={() => onSelect(order)}>Details</Btn>
        </div>
      </div>
    </Card>
  );
}

// ─── Quick Assign (inline select on card) ───────────────────────────────────

function QuickAssignDriver({ order, drivers, onAssigned }: { order: Order; drivers: Driver[]; onAssigned: () => void }) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (driverId: string) => {
    if (!driverId) return;
    setSaving(true);
    try {
      await adminRequest(`/delivery/orders/${order.id}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ driver_id: parseInt(driverId, 10) }),
      });
      onAssigned();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
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

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminRequest<{ order: Order }>(`/delivery/orders/${order.id}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ driver_id: driverId ? parseInt(driverId, 10) : null }),
      });
      onAssigned(res.order);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, background: '#f8fafc', borderRadius: 10, padding: 14, border: '1.5px solid #e5e7eb' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Assign Driver</p>
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

function DriversPanel({ drivers, onRefresh }: { drivers: Driver[]; onRefresh: () => void }) {
  const [form, setForm] = useState<{ name: string; phone: string; is_active: boolean }>({ name: '', phone: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editId !== null) {
        await adminRequest(`/delivery/drivers/${editId}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await adminRequest('/delivery/drivers', { method: 'POST', body: JSON.stringify(form) });
      }
      setForm({ name: '', phone: '', is_active: true });
      setEditId(null);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this driver? Active orders will be unassigned.')) return;
    try {
      await adminRequest(`/delivery/drivers/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch { /* ignore */ }
  };

  const startEdit = (d: Driver) => {
    setEditId(d.id);
    setForm({ name: d.name, phone: d.phone ?? '', is_active: d.is_active });
  };

  return (
    <div>
      {/* Add / Edit form */}
      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
          {editId !== null ? 'Edit Driver' : 'Add Driver'}
        </p>
        {error && <ErrorMsg message={error} />}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ flex: 2, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', minWidth: 140 }}
          />
          <input
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', minWidth: 120 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151' }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : editId !== null ? 'Update' : 'Add Driver'}
          </Btn>
          {editId !== null && (
            <Btn variant="secondary" onClick={() => { setEditId(null); setForm({ name: '', phone: '', is_active: true }); }}>
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
                  {d.phone && <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>📞 {d.phone}</p>}
                  <span style={{
                    display: 'inline-block', marginTop: 6, padding: '2px 8px',
                    background: d.is_active ? '#dcfce7' : '#f1f5f9',
                    color: d.is_active ? '#16a34a' : '#64748b',
                    borderRadius: 99, fontSize: 11, fontWeight: 600,
                  }}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
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
