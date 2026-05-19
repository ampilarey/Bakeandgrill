import { useState, useEffect, useMemo } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  fetchTables, createTable, updateTable, openTable, closeTable,
  mergeTables, splitTableByAmount,
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

// Form mirrors the StoreTableRequest schema: `name` is the unique
// table label (e.g. "1", "A1", "VIP-3"), `location` is the zone /
// area. Earlier this file used `number`/`zone`, which the backend
// silently dropped → "Add Table" appeared to do nothing because the
// validator rejected the request with "name field is required" and
// the list always came back empty because we read the wrong response
// key.
const defaultForm = { name: '', capacity: '2', location: '' };

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
  const [splitAmount, setSplitAmount]     = useState('');
  const [splitting, setSplitting]         = useState(false);
  const [toast, setToast]                 = useState('');
  const [confirmMerge, setConfirmMerge]   = useState(false);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

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

  // Merge is strictly Source → Target (the backend's MergeTablesRequest
  // requires exactly those two ids). Selection order in the UI now
  // matters: first selected = source (its open ticket moves), second =
  // target. The merge banner shows that explicitly so cashiers don't
  // accidentally swap them. The old "select N tables" flow sent
  // `{ table_ids: [...] }` which the backend silently 422'd.
  const handleMerge = async () => {
    if (selected.length !== 2) { setError('Merge requires exactly two tables: source then target.'); return; }
    const [sourceId, targetId] = selected;
    const sourceTable = tables.find(t => t.id === sourceId);
    if (!sourceTable?.current_order_id) {
      setError('Source table has no open ticket to merge into the target.');
      return;
    }
    setConfirmMerge(false);
    setActionLoading(-1);
    try {
      await mergeTables(sourceId, targetId);
      setSelected([]);
      showToast('Tables merged.');
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const splittingTable = tables.find(t => t.id === splitTableId) ?? null;

  // Split is "carve off a sub-bill of MVR X" — the most common cashier
  // flow ("table of 4 wants to pay 200 separately"). Backend supports
  // splitting by line-items too (`item_ids`); that needs its own modal
  // with the order's line list and is intentionally deferred.
  const handleSplit = async () => {
    if (!splittingTable || !splittingTable.current_order_id) {
      setError('No active ticket on this table to split.');
      return;
    }
    const amount = parseFloat(splitAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Enter the amount to split off (must be greater than 0).');
      return;
    }
    setSplitting(true);
    try {
      await splitTableByAmount(splittingTable.id, splittingTable.current_order_id, amount);
      setSplitTableId(null);
      setSplitAmount('');
      showToast(`Split MVR ${amount.toFixed(2)} into a new ticket.`);
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSplitting(false); }
  };

  const toggleSelect = (id: number) => {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;

  // Group tables by location (zone) for floor plan view.
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

      {selected.length > 0 && (
        <div style={{ background: '#FEF3E8', border: '1px solid #D4813A', borderRadius: 10, padding: '10px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {selected.length === 1 && (
              <span style={{ fontSize: 13, color: '#D4813A', fontWeight: 600 }}>
                Source: <strong>T{tables.find(t => t.id === selected[0])?.name}</strong>
                {' '}— select a target table to merge into
              </span>
            )}
            {selected.length === 2 && (() => {
              const src = tables.find(t => t.id === selected[0]);
              const tgt = tables.find(t => t.id === selected[1]);
              return (
                <span style={{ fontSize: 13, color: '#D4813A', fontWeight: 600 }}>
                  Move ticket from <strong>T{src?.name}</strong> → <strong>T{tgt?.name}</strong>
                </span>
              );
            })()}
            {selected.length > 2 && (
              <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                Merge supports exactly 2 tables — deselect {selected.length - 2}.
              </span>
            )}
            {selected.length === 2 && (
              <Btn small onClick={() => setConfirmMerge(true)} disabled={actionLoading === -1}>
                {actionLoading === -1 ? 'Merging…' : 'Merge → Target'}
              </Btn>
            )}
            <Btn small variant="secondary" onClick={() => { setSelected([]); setConfirmMerge(false); }}>Clear</Btn>
          </div>
          {confirmMerge && selected.length === 2 && (() => {
            const src = tables.find(t => t.id === selected[0]);
            const tgt = tables.find(t => t.id === selected[1]);
            return (
              <div style={{ marginTop: 10, background: '#fff', border: '1.5px solid #ef4444', borderRadius: 8, padding: '10px 14px' }}>
                <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>
                  Move the open ticket from <strong>T{src?.name}</strong> to <strong>T{tgt?.name}</strong>?
                  {tgt?.current_order_id ? ' Both tickets will be combined onto the target.' : ' The source table will be marked available.'}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn small variant="danger" onClick={() => void handleMerge()}>Yes, Merge</Btn>
                  <Btn small variant="secondary" onClick={() => setConfirmMerge(false)}>Cancel</Btn>
                </div>
              </div>
            );
          })()}
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
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1C1408' }}>T{t.name}</div>
                  <div style={{ fontSize: 12, color: '#9C8E7E' }}>Cap: {t.capacity ?? '—'}{t.location ? ` · ${t.location}` : ''}</div>
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
                {t.status === 'occupied' && t.current_order_id && (
                  <Btn small variant="secondary" onClick={() => { setSplitTableId(t.id); setSplitAmount(''); }}>Split Bill</Btn>
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
            <span style={{ fontSize: 12, color: '#9C8E7E', marginLeft: 'auto' }}>Click source then target to merge</span>
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
                        {t.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#9C8E7E' }}>
                        {t.capacity ?? '—'} seats
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

      {splitTableId && splittingTable && (
        <Modal title={`Split Bill — T${splittingTable.name}`} onClose={() => { setSplitTableId(null); setSplitAmount(''); }} maxWidth={400}>
          {!splittingTable.current_order_id ? (
            <>
              <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
                This table has no active ticket. Open the table from the POS first, then come back here to split the bill.
              </p>
              <ModalActions>
                <Btn variant="secondary" onClick={() => setSplitTableId(null)}>Close</Btn>
              </ModalActions>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 8 }}>
                Carve off part of <strong>Order #{splittingTable.current_order_number}</strong> into a new ticket.
              </p>
              {splittingTable.current_order_total != null && (
                <p style={{ fontSize: 12, color: '#9C8E7E', marginBottom: 16 }}>
                  Current bill total: <strong>MVR {splittingTable.current_order_total.toFixed(2)}</strong>
                </p>
              )}
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6B5D4F', marginBottom: 6 }}>
                Amount to split off (MVR) *
              </label>
              <input
                type="number" min="0.01" step="0.01"
                placeholder="e.g. 250.00"
                value={splitAmount}
                onChange={(e) => setSplitAmount(e.target.value)}
                style={{ ...S.input, marginBottom: 4 }}
                autoFocus
              />
              <p style={{ fontSize: 11, color: '#9C8E7E', margin: '6px 0 0' }}>
                A new ticket is created on the same table with this amount. The cashier can settle the two tickets independently.
              </p>
              <ModalActions>
                <Btn variant="secondary" onClick={() => { setSplitTableId(null); setSplitAmount(''); }}>Cancel</Btn>
                <Btn onClick={() => void handleSplit()} disabled={splitting || !splitAmount}>
                  {splitting ? 'Splitting…' : 'Split Bill'}
                </Btn>
              </ModalActions>
            </>
          )}
        </Modal>
      )}

      {modal && (
        <Modal title={editTable ? `Edit Table T${editTable.name}` : 'Add Table'} onClose={() => setModal(false)} maxWidth={400}>
          {formError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{formError}</p>}
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
    </div>
  );
}
