import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState,
} from '../components/SharedUI';
import {
  fetchLiveShifts, fetchShiftHistory, forceCloseShift,
} from '../api';
import type { ShiftHistoryRow } from '../api/pos-admin';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: '#6B5D4F', marginBottom: 4 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? '#D4813A' : 'transparent', color: active ? '#fff' : '#6B5D4F',
  }),
};

type Tab = 'live' | 'history';

function formatMVR(n: number | null | undefined) {
  if (n == null) return '—';
  return `MVR ${Number(n).toFixed(2)}`;
}

function isStaleOpenShift(openedAt: string, closedAt: string | null): boolean {
  if (closedAt) return false;
  return (Date.now() - new Date(openedAt).getTime()) >= 24 * 60 * 60 * 1000;
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
          {rows.map((s) => {
            const stale = isStaleOpenShift(s.opened_at, s.closed_at);
            return (
            <tr key={s.id} style={stale ? { background: '#FEF3C7' } : undefined}>
              <td style={{ ...TD, fontWeight: 600, color: stale ? '#92400e' : undefined }}>
                {stale && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                {s.user?.name ?? `#${s.user_id}`}
              </td>
              <td style={TD}>{s.device?.name ?? '—'}</td>
              <td style={{ ...TD, fontSize: 12, color: stale ? '#92400e' : '#9C8E7E' }}>{new Date(s.opened_at).toLocaleString()}</td>
              <td style={{ ...TD, fontSize: 12, color: '#9C8E7E' }}>
                {s.closed_at ? new Date(s.closed_at).toLocaleString() : stale ? 'Still open — close shift' : '—'}
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
            );
          })}
        </tbody>
      </table>
    </TableCard>
  );
}

export default function ShiftsPage() {
  usePageTitle('Shifts & Cash Drawer');
  const { can } = useCurrentUserPermissions();
  const canViewAll = can('shifts.view_all_history');

  const [tab, setTab] = useState<Tab>(canViewAll ? 'live' : 'history');
  const [error, setError] = useState('');

  const [liveShifts, setLiveShifts] = useState<ShiftHistoryRow[]>([]);
  const [historyShifts, setHistoryShifts] = useState<ShiftHistoryRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [forceTarget, setForceTarget] = useState<number | null>(null);
  const [forceNotes, setForceNotes] = useState('');
  const [forceSaving, setForceSaving] = useState(false);

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

  useEffect(() => {
    if (!canViewAll) return;
    if (tab === 'live') void loadLive();
    if (tab === 'history') void loadHistory();
  }, [tab, canViewAll]);

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

      <p style={{ fontSize: 13, color: '#6B5D4F', margin: '0 0 16px' }}>
        To open or close your own shift and record cash movements, use the <strong>POS terminal</strong>.
      </p>

      {!canViewAll ? (
        <EmptyState message="Shift oversight (live stations and history) requires manager permissions. Cashiers should open and close shifts on the POS." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
            <button type="button" style={S.tab(tab === 'live')} onClick={() => setTab('live')}>Live Shifts</button>
            <button type="button" style={S.tab(tab === 'history')} onClick={() => setTab('history')}>History</button>
          </div>

          {tab === 'live' && (
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

          {tab === 'history' && (
            adminLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9C8E7E' }}>Loading…</div>
            ) : (
              <AdminShiftTable rows={historyShifts} />
            )
          )}
        </>
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
