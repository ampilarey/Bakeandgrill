import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  fetchTables, createTable, updateTable, openTable, closeTable, mergeTables,
  type RestaurantTable,
} from '../api';

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

export default function TablesPage() {
  usePageTitle('Table Management');

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
    setActionLoading(-1);
    try { await mergeTables(selected); setSelected([]); void load(); }
    catch (e) { setError((e as Error).message); }
    finally { setActionLoading(null); }
  };

  const toggleSelect = (id: number) => {
    setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  };

  const available = tables.filter(t => t.status === 'available').length;
  const occupied  = tables.filter(t => t.status === 'occupied').length;

  return (
    <div>
      <PageHeader title="Table Management" action={<Btn onClick={() => openModal()}>+ Add Table</Btn>} />

      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Tables" value={String(tables.length)} accent="#D4813A" />
        <StatCard label="Available" value={String(available)} accent="#16a34a" />
        <StatCard label="Occupied" value={String(occupied)} accent="#f59e0b" />
      </div>

      {selected.length >= 2 && (
        <div style={{ background: '#FEF3E8', border: '1px solid #D4813A', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#D4813A', fontWeight: 600 }}>{selected.length} tables selected</span>
          <Btn small onClick={handleMerge} disabled={actionLoading === -1}>
            {actionLoading === -1 ? 'Merging…' : 'Merge Selected'}
          </Btn>
          <Btn small variant="secondary" onClick={() => setSelected([])}>Clear</Btn>
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</p>
      ) : tables.length === 0 ? (
        <EmptyState message="No tables configured yet." />
      ) : (
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
                <Btn small variant="secondary" onClick={() => openModal(t)}>Edit</Btn>
              </div>
            </div>
          ))}
        </div>
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
