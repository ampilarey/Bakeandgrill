import { useState, useEffect, useMemo } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  fetchTables, createTable, updateTable, openTable, closeTable, mergeTables, splitTable,
  type RestaurantTable,
} from '../api';
import { LayoutGrid, Map } from 'lucide-react';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#6B5D4F', marginBottom: 4 },
  card: (selected: boolean): React.CSSProperties => ({
    background: '#fff',
    border: selected ? '2.5px solid #D4813A' : '1.5px solid #E8E0D8',
    borderRadius: 14,
    padding: '18px 16px',
    cursor: 'pointer',
    position: 'relative',
    transition: 'box-shadow 0.15s',
    boxShadow: selected ? '0 0 0 2px #D4813A44' : '0 1px 4px rgba(0,0,0,0.06)',
  }),
};

const STATUS_COLOR: Record<string, string> = {
  available: 'green',
  occupied: 'orange',
  reserved: 'blue',
  closed: 'gray',
};

const defaultForm = { number: '', capacity: '2', zone: '' };

type ViewMode = 'cards' | 'floorplan';

const STATUS_BG: Record<string, string> = {
  available: '#DCFCE7',
  occupied:  '#FEF3C7',
  reserved:  '#DBEAFE',
  closed:    '#F3F4F6',
};
const STATUS_BORDER: Record<string, string> = {
  available: '#16a34a',
  occupied:  '#d97706',
  reserved:  '#2563eb',
  closed:    '#9ca3af',
};
const STATUS_TEXT: Record<string, string> = {
  available: '#15803d',
  occupied:  '#b45309',
  reserved:  '#1d4ed8',
  closed:    '#6b7280',
};

export default function TablesPage() {
  usePageTitle('Table Management');

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);

  const [modal, setModal] = useState(false);
  const [editTable, setEditTable] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [splitTableId, setSplitTableId]   = useState<number | null>(null);
  const [splitInto, setSplitInto]         = useState('2');
  const [splitting, setSplitting]         = useState(false);
  const [toast, setToast]                 = useState('');
  const [confirmMerge, setConfirmMerge]   = useState(false);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchTables();
      setTables(res.data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const openModal = (t?: RestaurantTable) => {
    setEditTable(t ?? null);
    setForm(t ? { number: t.number, capacity: String(t.capacity), zone: t.zone ?? '' } : defaultForm);
    setFormError('');
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.number.trim()) { setFormError('Table number is required.'); return; }
    const cap = parseInt(form.capacity, 10);
    if (isNaN(cap) || cap < 1) { setFormError('Enter a valid capacity.'); return; }
    setSaving(true); setFormError('');
    try {
      const data = { number: form.number.trim(), capacity: cap, zone: form.zone.trim() || undefined };
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

  const handleOpen = async (id: number) => {
    setActionLoading(id);
    try { await openTable(id); void load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const handleClose = async (id: number) => {
    setActionLoading(id);
    try { await closeTable(id); void load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const handleMerge = async () => {
    if (selected.length < 2) { setError('Select at least 2 tables to merge.'); return; }
    setConfirmMerge(false);
    setActionLoading(-1);
    try { await mergeTables(selected); setSelected([]); showToast('Tables merged.'); void load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const handleSplit = async () => {
    if (!splitTableId) return;
    const into = parseInt(splitInto, 10);
    if (isNaN(into) || into < 2) { setError('Must split into at least 2 tables.'); return; }
    setSplitting(true);
    try {
      await splitTable(splitTableId, into);
      setSplitTableId(null);
      showToast(`Table split into ${into}.`);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSplitting(false); }
  };

  const toggleSelect = (id: number) => {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;

  // Group tables by zone for floor plan view
  const zones = useMemo(() => {
    const map: Record<string, RestaurantTable[]> = {};
    for (const t of tables) {
      const z = t.zone?.trim() || 'General';
      if (!map[z]) map[z] = [];
      map[z].push(t);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [tables]);

  return (
    <div>
      <PageHeader
        title="Table Management"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', border: '1.5px solid #E8E0D8', borderRadius: 10, overflow: 'hidden' }}>
              {([['cards', LayoutGrid, 'Cards'], ['floorplan', Map, 'Floor Plan']] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', fontSize: 13, fontWeight: viewMode === mode ? 700 : 500,
                    background: viewMode === mode ? '#D4813A' : '#fff',
                    color: viewMode === mode ? '#fff' : '#6B5D4F',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <Btn onClick={() => openModal()}>+ Add Table</Btn>
          </div>
        }
      />

      {toast && <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{toast}</div>}
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Tables" value={String(tables.length)} accent="#D4813A" />
        <StatCard label="Available" value={String(available)} accent="#16a34a" />
        <StatCard label="Occupied" value={String(occupied)} accent="#f59e0b" />
      </div>

      {selected.length >= 2 && (
        <div style={{ background: '#FEF3E8', border: '1px solid #D4813A', borderRadius: 10, padding: '10px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#D4813A', fontWeight: 600 }}>{selected.length} tables selected</span>
            <Btn small onClick={() => setConfirmMerge(true)} disabled={actionLoading === -1}>
              {actionLoading === -1 ? 'Merging…' : 'Merge Selected'}
            </Btn>
            <Btn small variant="secondary" onClick={() => { setSelected([]); setConfirmMerge(false); }}>Clear</Btn>
          </div>
          {confirmMerge && (
            <div style={{ marginTop: 10, background: '#fff', border: '1.5px solid #ef4444', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>
                Merge {selected.length} tables? This cannot be undone mid-service.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small variant="danger" onClick={() => void handleMerge()}>Yes, Merge</Btn>
                <Btn small variant="secondary" onClick={() => setConfirmMerge(false)}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</p>
      ) : tables.length === 0 ? (
        <EmptyState message="No tables configured yet." />
      ) : viewMode === 'cards' ? (
        // ── CARD GRID VIEW ────────────────────────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {tables.map(t => (
            <div key={t.id} style={S.card(selected.includes(t.id))} onClick={() => toggleSelect(t.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1C1408' }}>T{t.number}</div>
                  <div style={{ fontSize: 12, color: '#9C8E7E' }}>Cap: {t.capacity}{t.zone ? ` · ${t.zone}` : ''}</div>
                </div>
                <Badge color={STATUS_COLOR[t.status] ?? 'gray'}>{t.status}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }} onClick={e => e.stopPropagation()}>
                {t.status !== 'occupied' && t.status !== 'closed' && (
                  <Btn small onClick={() => handleOpen(t.id)} disabled={actionLoading === t.id}>Open</Btn>
                )}
                {t.status === 'occupied' && (
                  <Btn small variant="secondary" onClick={() => handleClose(t.id)} disabled={actionLoading === t.id}>Close</Btn>
                )}
                {t.status === 'occupied' && (
                  <Btn small variant="secondary" onClick={() => { setSplitTableId(t.id); setSplitInto('2'); }}>Split</Btn>
                )}
                <Btn small variant="secondary" onClick={() => openModal(t)}>Edit</Btn>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── FLOOR PLAN VIEW ───────────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px', background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12 }}>
            {Object.entries(STATUS_BG).map(([status, bg]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `2px solid ${STATUS_BORDER[status]}` }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6B5D4F', textTransform: 'capitalize' }}>{status}</span>
              </div>
            ))}
            <span style={{ fontSize: 12, color: '#9C8E7E', marginLeft: 'auto' }}>Click a table to select · Hold Shift to select multiple</span>
          </div>

          {zones.map(([zone, zoneTables]) => (
            <div key={zone} style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 16, overflow: 'hidden' }}>
              {/* Zone header */}
              <div style={{
                padding: '12px 20px',
                borderBottom: '1px solid #F0EAE3',
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#FAFAF8',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1408' }}>{zone}</span>
                <span style={{ fontSize: 12, color: '#9C8E7E' }}>{zoneTables.length} table{zoneTables.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                  {zoneTables.filter(t => t.status === 'available').length} available
                </span>
                {zoneTables.filter(t => t.status === 'occupied').length > 0 && (
                  <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                    {zoneTables.filter(t => t.status === 'occupied').length} occupied
                  </span>
                )}
              </div>

              {/* Tables grid */}
              <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {zoneTables.map(t => {
                  const isSelected = selected.includes(t.id);
                  const bg = STATUS_BG[t.status] ?? '#F9FAFB';
                  const border = STATUS_BORDER[t.status] ?? '#E5E7EB';
                  const textColor = STATUS_TEXT[t.status] ?? '#374151';
                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleSelect(t.id)}
                      style={{
                        width: 100, minHeight: 90,
                        background: bg,
                        border: `2.5px solid ${isSelected ? '#D4813A' : border}`,
                        borderRadius: 12,
                        padding: '10px 8px',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 4,
                        boxShadow: isSelected ? '0 0 0 3px rgba(212,129,58,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                    >
                      {isSelected && (
                        <div style={{
                          position: 'absolute', top: 4, right: 4,
                          width: 16, height: 16, borderRadius: '50%',
                          background: '#D4813A', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>
                        </div>
                      )}
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#1C1408', lineHeight: 1 }}>
                        {t.number}
                      </div>
                      <div style={{ fontSize: 11, color: '#9C8E7E' }}>
                        {t.capacity} seats
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: textColor, textTransform: 'capitalize' }}>
                        {t.status}
                      </div>

                      {/* Quick actions on hover — using a group of small buttons */}
                      <div
                        style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {t.status !== 'occupied' && t.status !== 'closed' && (
                          <button
                            onClick={() => handleOpen(t.id)}
                            disabled={actionLoading === t.id}
                            style={{ fontSize: 10, padding: '2px 7px', border: `1px solid ${border}`, borderRadius: 6, background: '#fff', color: textColor, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                          >
                            Open
                          </button>
                        )}
                        {t.status === 'occupied' && (
                          <button
                            onClick={() => handleClose(t.id)}
                            disabled={actionLoading === t.id}
                            style={{ fontSize: 10, padding: '2px 7px', border: '1px solid #E8E0D8', borderRadius: 6, background: '#fff', color: '#6B5D4F', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                          >
                            Close
                          </button>
                        )}
                        <button
                          onClick={() => openModal(t)}
                          style={{ fontSize: 10, padding: '2px 7px', border: '1px solid #E8E0D8', borderRadius: 6, background: '#fff', color: '#6B5D4F', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {splitTableId && (
        <Modal title="Split Table" onClose={() => setSplitTableId(null)} maxWidth={360}>
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Split this table into multiple smaller tables. The original table will be closed.
          </p>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6B5D4F', marginBottom: 6 }}>
            Number of tables to split into *
          </label>
          <input
            type="number" min="2" max="10"
            value={splitInto}
            onChange={(e) => setSplitInto(e.target.value)}
            style={{ ...S.input, marginBottom: 4 }}
          />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setSplitTableId(null)}>Cancel</Btn>
            <Btn onClick={() => void handleSplit()} disabled={splitting}>
              {splitting ? 'Splitting…' : 'Split Table'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {modal && (
        <Modal title={editTable ? `Edit Table T${editTable.number}` : 'Add Table'} onClose={() => setModal(false)} maxWidth={400}>
          {formError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{formError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={S.label}>Table Number *</span>
              <input type="text" placeholder="e.g. 1, A1, VIP1" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Capacity *</span>
              <input type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Zone / Area</span>
              <input type="text" placeholder="e.g. Indoor, Terrace, VIP…" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} style={S.input} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancel</Btn>
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
