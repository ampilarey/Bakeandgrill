import { useState, useEffect } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState, StatCard,
} from '../components/SharedUI';
import {
  getCurrentShift, openShift, closeShift, addCashMovement,
  fetchLiveShifts, fetchShiftHistory, forceCloseShift,
  type Shift, type CashMovement,
} from '../api';
import type { ShiftHistoryRow } from '../api/pos-admin';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#6B5D4F', marginBottom: 4 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? '#D4813A' : 'transparent', color: active ? '#fff' : '#6B5D4F',
  }),
};

type Tab = 'mine' | 'live' | 'history';

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

function MyShiftPanel({
  shift, setShift, load,
}: {
  shift: Shift | null;
  setShift: (s: Shift | null) => void;
  load: () => Promise<void>;
}) {
  const [openingCash, setOpeningCash] = useState('');
  const [openSaving, setOpenSaving] = useState(false);
  const [openError, setOpenError] = useState('');
  const [closeModal, setCloseModal] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closeSaving, setCloseSaving] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [movType, setMovType] = useState<'cash_in' | 'cash_out' | 'paid_in' | 'paid_out'>('cash_in');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState('');

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
    if (!shift) return;
    const cash = parseFloat(closingCash);
    if (isNaN(cash) || cash < 0) { setCloseError('Enter a valid closing cash amount.'); return; }
    setCloseSaving(true); setCloseError('');
    try {
      const res = await closeShift(shift.id, { closing_cash: cash, notes: closeNotes || undefined });
      setShift(res.shift);
      setCloseModal(false);
      setClosingCash(''); setCloseNotes('');
    } catch (e) { setCloseError((e as Error).message); }
    finally { setCloseSaving(false); }
  };

  const handleMovement = async () => {
    if (!shift) return;
    const amount = parseFloat(movAmount);
    if (isNaN(amount) || amount <= 0) { setMovError('Enter a valid amount.'); return; }
    if (!movReason.trim()) { setMovError('Reason is required.'); return; }
    setMovSaving(true); setMovError('');
    try {
      await addCashMovement(shift.id, { type: movType, amount, reason: movReason.trim() });
      setMovAmount(''); setMovReason('');
      void load();
    } catch (e) { setMovError((e as Error).message); }
    finally { setMovSaving(false); }
  };

  if (!shift || shift.closed_at) {
    return (
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
    );
  }

  return (
    <>
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
        <StatCard label="Expected Cash*" value={formatMVR((shift.opening_cash ?? 0) + (shift.total_cash_in ?? 0) - (shift.total_cash_out ?? 0))} accent="#6B5D4F" />
      </div>

      <p style={{ fontSize: 12, color: '#9C8E7E', marginBottom: 20 }}>
        * Expected Cash includes cash movements only. Cash sales are added automatically when the shift closes.
      </p>

      <div style={{ background: '#fff', border: '1.5px solid #E8E0D8', borderRadius: 14, padding: 24, marginBottom: 24, maxWidth: 540 }}>
        <h4 style={{ margin: '0 0 16px', fontSize: 15, color: '#1C1408' }}>Record Cash Movement</h4>
        {movError && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{movError}</p>}
        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label>
            <span style={S.label}>Type</span>
            <select value={movType} onChange={e => setMovType(e.target.value as typeof movType)} style={S.select}>
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
              <option value="paid_in">Paid In</option>
              <option value="paid_out">Paid Out</option>
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
                <td style={TD}><Badge color={m.type === 'cash_in' || m.type === 'paid_in' ? 'green' : 'red'}>{m.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Badge></td>
                <td style={{ ...TD, fontWeight: 700 }}>{formatMVR(m.amount)}</td>
                <td style={TD}>{m.reason}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{m.user?.name ?? '—'}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{new Date(m.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {closeModal && (
        <Modal title="Close Shift" onClose={() => setCloseModal(false)} maxWidth={420}>
          {closeError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{closeError}</p>}
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Enter the actual cash counted in the drawer. The server calculates expected cash including cash sales.
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
    </>
  );
}

function AdminShiftTable({
  rows,
  showForceClose,
  onForceClose,
}: {
  rows: ShiftHistoryRow[];
  showForceClose?: boolean;
  onForceClose?: (id: number) => void;
}) {
  if (rows.length === 0) return <EmptyState message="No shifts found." />;

  return (
    <TableCard>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Cashier', 'Station', 'Opened', 'Closed', 'Opening', 'Closing', 'Variance', ...(showForceClose ? [''] : [])].map(h => (
              <th key={h || 'actions'} style={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td style={{ ...TD, fontWeight: 600 }}>{s.user?.name ?? `#${s.user_id}`}</td>
              <td style={TD}>{s.device?.name ?? '—'}</td>
              <td style={{ ...TD, fontSize: 12, color: '#9C8E7E' }}>{new Date(s.opened_at).toLocaleString()}</td>
              <td style={{ ...TD, fontSize: 12, color: '#9C8E7E' }}>
                {s.closed_at ? new Date(s.closed_at).toLocaleString() : '—'}
              </td>
              <td style={TD}>{formatMVR(s.opening_cash)}</td>
              <td style={TD}>{formatMVR(s.closing_cash)}</td>
              <td style={TD}>
                {s.variance != null ? (
                  <Badge color={Math.abs(s.variance) < 0.01 ? 'green' : 'red'}>{formatMVR(s.variance)}</Badge>
                ) : '—'}
              </td>
              {showForceClose && (
                <td style={TD}>
                  <Btn small variant="secondary" onClick={() => onForceClose?.(s.id)}>Force close</Btn>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

export default function ShiftsPage() {
  usePageTitle('Shifts & Cash Drawer');
  const { can } = useCurrentUserPermissions();
  const canViewAll = can('shifts.view_all_history');

  const [tab, setTab] = useState<Tab>('mine');
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [liveShifts, setLiveShifts] = useState<ShiftHistoryRow[]>([]);
  const [historyShifts, setHistoryShifts] = useState<ShiftHistoryRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [forceTarget, setForceTarget] = useState<number | null>(null);
  const [forceNotes, setForceNotes] = useState('');
  const [forceSaving, setForceSaving] = useState(false);

  const loadMine = async () => {
    setLoading(true); setError('');
    try {
      const res = await getCurrentShift();
      setShift(res.shift);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  const loadLive = async () => {
    setAdminLoading(true); setError('');
    try {
      const res = await fetchLiveShifts();
      setLiveShifts(res.shifts ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setAdminLoading(false); }
  };

  const loadHistory = async () => {
    setAdminLoading(true); setError('');
    try {
      const res = await fetchShiftHistory();
      setHistoryShifts(res.shifts ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setAdminLoading(false); }
  };

  useEffect(() => { void loadMine(); }, []);

  useEffect(() => {
    if (tab === 'live') void loadLive();
    if (tab === 'history') void loadHistory();
  }, [tab]);

  const handleForceClose = async () => {
    if (!forceTarget) return;
    setForceSaving(true);
    try {
      await forceCloseShift(forceTarget, forceNotes || undefined);
      setForceTarget(null);
      setForceNotes('');
      void loadLive();
    } catch (e) { setError((e as Error).message); }
    finally { setForceSaving(false); }
  };

  return (
    <div>
      <PageHeader title="Shifts & Cash Drawer" />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" style={S.tab(tab === 'mine')} onClick={() => setTab('mine')}>My Shift</button>
        {canViewAll && (
          <>
            <button type="button" style={S.tab(tab === 'live')} onClick={() => setTab('live')}>Live Shifts</button>
            <button type="button" style={S.tab(tab === 'history')} onClick={() => setTab('history')}>History</button>
          </>
        )}
      </div>

      {tab === 'mine' && (
        loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>Loading…</div>
        ) : (
          <MyShiftPanel shift={shift} setShift={setShift} load={loadMine} />
        )
      )}

      {tab === 'live' && canViewAll && (
        adminLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>Loading…</div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 12 }}>
              {liveShifts.length} open shift{liveShifts.length !== 1 ? 's' : ''} across all stations
            </p>
            <AdminShiftTable
              rows={liveShifts}
              showForceClose
              onForceClose={(id) => { setForceTarget(id); setForceNotes(''); }}
            />
          </>
        )
      )}

      {tab === 'history' && canViewAll && (
        adminLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>Loading…</div>
        ) : (
          <AdminShiftTable rows={historyShifts} />
        )
      )}

      {forceTarget && (
        <Modal title="Force Close Shift" onClose={() => setForceTarget(null)} maxWidth={420}>
          <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 16 }}>
            Use when a cashier forgot to close their shift. Expected cash will be recorded as closing cash.
          </p>
          <label>
            <span style={S.label}>Notes</span>
            <textarea
              value={forceNotes}
              onChange={(e) => setForceNotes(e.target.value)}
              rows={3}
              style={{ ...S.input, resize: 'vertical' }}
              placeholder="Reason for force close…"
            />
          </label>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setForceTarget(null)}>Cancel</Btn>
            <Btn onClick={() => void handleForceClose()} disabled={forceSaving}>
              {forceSaving ? 'Closing…' : 'Force Close'}
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
