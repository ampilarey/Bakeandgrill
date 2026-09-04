import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, PageShell, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import { TableQrModal, TableQrSheetModal } from '../components/TableQrModal';
import {
  fetchTables, createTable, updateTable,
  type RestaurantTable,
} from '../api';
import { LayoutGrid, Map, QrCode } from 'lucide-react';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: 'var(--color-text-secondary)', marginBottom: 4 },
  card: (): React.CSSProperties => ({
    background: 'var(--color-surface)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 14,
    padding: '18px 16px',
    position: 'relative',
    transition: 'box-shadow 0.15s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  }),
};

const STATUS_COLOR: Record<string, string> = {
  available: 'green',
  occupied: 'orange',
  reserved: 'blue',
  closed: 'gray',
};

const defaultForm = { name: '', capacity: '2', location: '' };

type ViewMode = 'cards' | 'floorplan';

const STATUS_BG: Record<string, string> = {
  available: 'var(--color-success-bg)',
  occupied:  'var(--color-warning-bg)',
  reserved:  '#DBEAFE',
  closed:    '#F3F4F6',
};
const STATUS_BORDER: Record<string, string> = {
  available: 'var(--color-success-strong)',
  occupied:  '#d97706',
  reserved:  '#2563eb',
  closed:    '#9ca3af',
};
const STATUS_TEXT: Record<string, string> = {
  available: 'var(--color-success-strong)',
  occupied:  'var(--color-warning-strong)',
  reserved:  '#1d4ed8',
  closed:    '#6b7280',
};

function OrderPeek({ table }: { table: RestaurantTable }) {
  if (table.status !== 'occupied' || !table.current_order_id) return null;
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
      {table.current_order_number != null && (
        <div>
          Order{' '}
          <Link
            to={`/orders?order=${table.current_order_id}`}
            style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none' }}
          >
            #{table.current_order_number}
          </Link>
        </div>
      )}
      {table.current_order_total != null && (
        <div>MVR {table.current_order_total.toFixed(2)}</div>
      )}
    </div>
  );
}

export default function TablesPage() {
  usePageTitle('Table Management');

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(false);
  const [editTable, setEditTable] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  /** The QR card for one table, and the whole-floor sheet. */
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null);
  const [qrSheet, setQrSheet] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchTables();
      setTables(res.tables ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const openModal = (t?: RestaurantTable) => {
    setEditTable(t ?? null);
    setForm(t
      ? { name: t.name, capacity: String(t.capacity ?? ''), location: t.location ?? '' }
      : defaultForm);
    setFormError('');
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Table name is required.'); return; }
    const cap = parseInt(form.capacity, 10);
    if (isNaN(cap) || cap < 1) { setFormError('Enter a valid capacity.'); return; }
    setSaving(true); setFormError('');
    try {
      const data = { name: form.name.trim(), capacity: cap, location: form.location.trim() || undefined };
      if (editTable) {
        await updateTable(editTable.id, data);
      } else {
        await createTable(data);
      }
      setModal(false);
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;

  const zones = useMemo(() => {
    const map: Record<string, RestaurantTable[]> = {};
    for (const t of tables) {
      const z = t.location?.trim() || 'General';
      if (!map[z]) map[z] = [];
      map[z].push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [tables]);

  return (
    <PageShell>
    <div>
      <PageHeader section="Monitor"
        title="Table Management"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', border: '1.5px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              {([['cards', LayoutGrid, 'Cards'], ['floorplan', Map, 'Floor Plan']] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', fontSize: 13, fontWeight: viewMode === mode ? 700 : 500,
                    background: viewMode === mode ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: viewMode === mode ? '#fff' : 'var(--color-text-secondary)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <Btn variant="secondary" onClick={() => setQrSheet(true)} disabled={tables.length === 0}>
              <QrCode size={14} /> QR Codes
            </Btn>
            <Btn onClick={() => openModal()}>+ Add Table</Btn>
          </div>
        }
      />

      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
        Configure seating layout here. Open, close, merge, and split run on the{' '}
        <strong style={{ color: 'var(--color-text)' }}>POS</strong>. Each table also has a{' '}
        <strong style={{ color: 'var(--color-text)' }}>QR card</strong> guests scan to order from
        their seat — print them from <em>QR Codes</em>, or one at a time from a table.
      </p>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Tables" value={String(tables.length)} accent="var(--color-primary)" />
        <StatCard label="Available" value={String(available)} accent="var(--color-success-strong)" />
        <StatCard label="Occupied" value={String(occupied)} accent="var(--color-warning)" />
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : tables.length === 0 ? (
        <EmptyState message="No tables configured yet." />
      ) : viewMode === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {tables.map(t => (
            <div key={t.id} style={S.card()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>T{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Cap: {t.capacity ?? '—'}{t.location ? ` · ${t.location}` : ''}</div>
                </div>
                <Badge color={STATUS_COLOR[t.status] ?? 'gray'}>{t.status}</Badge>
              </div>
              <OrderPeek table={t} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <Btn small variant="secondary" onClick={() => openModal(t)}>Edit</Btn>
                <Btn small variant="secondary" onClick={() => setQrTable(t)}>QR</Btn>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }}>
            {Object.entries(STATUS_BG).map(([status, bg]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `2px solid ${STATUS_BORDER[status]}` }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{status}</span>
              </div>
            ))}
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              Floor service runs on POS
            </span>
          </div>

          {zones.map(([zone, zoneTables]) => (
            <div key={zone} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 20px',
                borderBottom: '1px solid #F0EAE3',
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#FAFAF8',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>{zone}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{zoneTables.length} table{zoneTables.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: 12, color: 'var(--color-success-strong)', fontWeight: 600 }}>
                  {zoneTables.filter(t => t.status === 'available').length} available
                </span>
                {zoneTables.filter(t => t.status === 'occupied').length > 0 && (
                  <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                    {zoneTables.filter(t => t.status === 'occupied').length} occupied
                  </span>
                )}
              </div>

              <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {zoneTables.map(t => {
                  const bg = STATUS_BG[t.status] ?? '#F9FAFB';
                  const border = STATUS_BORDER[t.status] ?? '#E5E7EB';
                  const textColor = STATUS_TEXT[t.status] ?? '#374151';
                  return (
                    <div
                      key={t.id}
                      style={{
                        width: 110, minHeight: 100,
                        background: bg,
                        border: `2.5px solid ${border}`,
                        borderRadius: 12,
                        padding: '10px 8px',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {t.capacity ?? '—'} seats
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: textColor, textTransform: 'capitalize' }}>
                        {t.status}
                      </div>
                      {t.current_order_number != null && t.current_order_id != null && (
                        <Link
                          to={`/orders?order=${t.current_order_id}`}
                          style={{ fontSize: 10, color: 'var(--color-primary)', fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          #{t.current_order_number}
                        </Link>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {([['Edit', () => openModal(t)], ['QR', () => setQrTable(t)]] as const).map(([label, act]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={act}
                            style={{ fontSize: 10, padding: '2px 7px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={editTable ? `Edit Table T${editTable.name}` : 'Add Table'} onClose={() => setModal(false)} maxWidth={400}>
          {formError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{formError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={S.label}>Table Name *</span>
              <input type="text" placeholder="e.g. 1, A1, VIP1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Capacity *</span>
              <input type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Location / Zone</span>
              <input type="text" placeholder="e.g. Indoor, Terrace, VIP…" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={S.input} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {qrTable && <TableQrModal table={qrTable} onClose={() => setQrTable(null)} />}
      {qrSheet && <TableQrSheetModal tables={tables} onClose={() => setQrSheet(false)} />}
    </div>

    </PageShell>
  );
}
