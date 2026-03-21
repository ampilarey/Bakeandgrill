import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  getCurrentShift, openShift, closeShift, addCashMovement,
  type Shift, type CashMovement,
} from '../api';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#6B5D4F', marginBottom: 4 },
};

function formatMVR(n: number | null | undefined) {
  if (n == null) return '—';
  return `MVR ${Number(n).toFixed(2)}`;
}

function elapsed(from: string) {
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function ShiftsPage() {
  usePageTitle('Shifts & Cash Drawer');

  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Open shift form
  const [openingCash, setOpeningCash] = useState('');
  const [openSaving, setOpenSaving] = useState(false);
  const [openError, setOpenError] = useState('');

  // Close shift modal
  const [closeModal, setCloseModal] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState('');

  // Cash movement form
  const [movType, setMovType] = useState<'in' | 'out'>('in');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await getCurrentShift();
      setShift(res.shift);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleOpen = async () => {
    const cash = parseFloat(openingCash);
    if (isNaN(cash) || cash < 0) { setOpenError('Enter a valid opening cash amount.'); return; }
    setOpenSaving(true); setOpenError('');
    try {
      const res = await openShift({ opening_cash: cash });
      setShift(res.shift);
      setOpeningCash('');
    } catch (e) { setOpenError((e as Error).message); }
    finally { setOpenSaving(false); }
  };

  const handleClose = async () => {
    const cash = parseFloat(closingCash);
    if (isNaN(cash) || cash < 0) { setCloseError('Enter a valid closing cash amount.'); return; }
    setCloseSaving(true); setCloseError('');
    try {
      const res = await closeShift(shift!.id, { closing_cash: cash, notes: closeNotes || undefined });
      setShift(res.shift);
      setCloseModal(false);
      setClosingCash(''); setCloseNotes('');
    } catch (e) { setCloseError((e as Error).message); }
    finally { setCloseSaving(false); }
  };

  const handleMovement = async () => {
    const amount = parseFloat(movAmount);
    if (isNaN(amount) || amount <= 0) { setMovError('Enter a valid amount.'); return; }
    if (!movReason.trim()) { setMovError('Reason is required.'); return; }
    setMovSaving(true); setMovError('');
    try {
      const res = await addCashMovement(shift!.id, { type: movType, amount, reason: movReason.trim() });
      setShift(prev => prev ? {
        ...prev,
        cash_movements: [...(prev.cash_movements ?? []), res.movement],
        total_cash_in:  movType === 'in'  ? prev.total_cash_in  + amount : prev.total_cash_in,
        total_cash_out: movType === 'out' ? prev.total_cash_out + amount : prev.total_cash_out,
      } : prev);
      setMovAmount(''); setMovReason('');
    } catch (e) { setMovError((e as Error).message); }
    finally { setMovSaving(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>Loading…</div>;

  return (
    <div>
      <PageHeader title="Shifts & Cash Drawer" />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      {/* ── No Open Shift ── */}
      {!shift || shift.status === 'closed' ? (
        <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 14, padding: 32, maxWidth: 480 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#1C1408' }}>No Active Shift</h3>
          <p style={{ margin: '0 0 24px', color: '#6B5D4F', fontSize: 14 }}>Open a new shift to start tracking cash and sales.</p>
          {openError && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{openError}</p>}
          <label>
            <span style={S.label}>Opening Cash (MVR) *</span>
            <input
              type="number" min="0" step="0.01" placeholder="0.00"
              value={openingCash} onChange={e => setOpeningCash(e.target.value)}
              style={{ ...S.input, marginBottom: 16 }}
            />
          </label>
          <Btn onClick={handleOpen} disabled={openSaving}>{openSaving ? 'Opening…' : 'Open Shift'}</Btn>
        </div>
      ) : (
        <>
          {/* ── Shift Summary ── */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <Badge color="green">Shift Open</Badge>
            <span style={{ color: '#6B5D4F', fontSize: 13 }}>
              Opened at {new Date(shift.opened_at).toLocaleTimeString()} · Running {elapsed(shift.opened_at)}
            </span>
            <div style={{ marginLeft: 'auto' }}>
              <Btn variant="secondary" onClick={() => { setCloseModal(true); setCloseError(''); }}>Close Shift</Btn>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Opening Cash" value={formatMVR(shift.opening_cash)} accent="#D4813A" />
            <StatCard label="Cash In" value={formatMVR(shift.total_cash_in)} accent="#16a34a" />
            <StatCard label="Cash Out" value={formatMVR(shift.total_cash_out)} accent="#ef4444" />
            <StatCard label="Expected Cash" value={formatMVR((shift.opening_cash ?? 0) + (shift.total_cash_in ?? 0) - (shift.total_cash_out ?? 0))} accent="#6B5D4F" />
          </div>

          {/* ── Cash Movement Form ── */}
          <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 14, padding: 24, marginBottom: 24, maxWidth: 540 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 15, color: '#1C1408' }}>Record Cash Movement</h4>
            {movError && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{movError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <label>
                <span style={S.label}>Type</span>
                <select value={movType} onChange={e => setMovType(e.target.value as 'in' | 'out')} style={S.select}>
                  <option value="in">Cash In</option>
                  <option value="out">Cash Out</option>
                </select>
              </label>
              <label>
                <span style={S.label}>Amount (MVR) *</span>
                <input type="number" min="0.01" step="0.01" placeholder="0.00" value={movAmount} onChange={e => setMovAmount(e.target.value)} style={S.input} />
              </label>
            </div>
            <label>
              <span style={S.label}>Reason *</span>
              <input type="text" placeholder="e.g. Petty cash, bank deposit…" value={movReason} onChange={e => setMovReason(e.target.value)} style={{ ...S.input, marginBottom: 12 }} />
            </label>
            <Btn onClick={handleMovement} disabled={movSaving}>{movSaving ? 'Recording…' : 'Record Movement'}</Btn>
          </div>

          {/* ── Movements Log ── */}
          <h4 style={{ margin: '0 0 12px', fontSize: 15, color: '#1C1408' }}>Cash Movements This Shift</h4>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Type', 'Amount', 'Reason', 'By', 'Time'].map(h => <th key={h} style={TH}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {!shift.cash_movements || shift.cash_movements.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState message="No movements recorded yet." /></td></tr>
                ) : shift.cash_movements.map((m: CashMovement) => (
                  <tr key={m.id}>
                    <td style={TD}><Badge color={m.type === 'in' ? 'green' : 'red'}>{m.type === 'in' ? 'Cash In' : 'Cash Out'}</Badge></td>
                    <td style={{ ...TD, fontWeight: 700 }}>{formatMVR(m.amount)}</td>
                    <td style={TD}>{m.reason}</td>
                    <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{m.user?.name ?? '—'}</td>
                    <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(m.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ── Close Shift Modal ── */}
      {closeModal && (
        <Modal title="Close Shift" onClose={() => setCloseModal(false)} maxWidth={420}>
          {closeError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{closeError}</p>}
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Expected cash in drawer: <strong>{formatMVR((shift?.opening_cash ?? 0) + (shift?.total_cash_in ?? 0) - (shift?.total_cash_out ?? 0))}</strong>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              <span style={S.label}>Actual Closing Cash (MVR) *</span>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={closingCash} onChange={e => setClosingCash(e.target.value)} style={S.input} />
            </label>
            <label>
              <span style={S.label}>Notes</span>
              <textarea placeholder="Any notes about this shift…" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} rows={3} style={{ ...S.input, resize: 'vertical' }} />
            </label>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setCloseModal(false)}>Cancel</Btn>
            <Btn onClick={handleClose} disabled={closeSaving}>{closeSaving ? 'Closing…' : 'Close Shift'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
