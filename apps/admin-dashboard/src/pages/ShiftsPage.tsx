import { Fragment, useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, PageShell, TableCard, TD, Badge, Btn, Modal, ModalActions, EmptyState,
} from '../components/SharedUI';
import { SortFilterHead, useSortFilter } from '../components/TableControls';
import {
  fetchLiveShifts, fetchShiftHistory, forceCloseShift, voidCashMovement,
} from '../api';
import type { ShiftHistoryRow } from '../api/pos-admin';

const S = {
  input: { width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  label: { display: 'block' as const, fontSize: 13, fontWeight: 600 as const, color: 'var(--color-text-secondary)', marginBottom: 4 },
  tab: (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 400,
    background: active ? 'var(--color-primary)' : 'transparent', color: active ? '#fff' : 'var(--color-text-secondary)',
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

function denomLabel(laari: number): string {
  if (laari >= 100 && laari % 100 === 0) return `MVR ${laari / 100}`;
  return `${laari} laari`;
}

function AdminShiftTable({
  rows,
  showForceClose,
  onForceClose,
  onVoidMovement,
  highlightId,
}: {
  rows: ShiftHistoryRow[];
  showForceClose?: boolean;
  onForceClose?: (id: number) => void;
  onVoidMovement?: (shiftId: number, movementId: number) => void;
  highlightId?: number | null;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const shiftCtl = useSortFilter(rows, [
    { key: 'shift', label: 'Shift', kind: 'number', get: (s) => s.id },
    { key: 'cashier', label: 'Cashier', get: (s) => s.user?.name ?? (s.user_id ? `#${s.user_id}` : '') },
    { key: 'station', label: 'Station', get: (s) => s.device?.name },
    { key: 'opened', label: 'Opened', get: (s) => s.opened_at },
    { key: 'closed', label: 'Closed', get: (s) => s.closed_at },
    { key: 'opening', label: 'Opening', kind: 'number', get: (s) => s.opening_cash },
    { key: 'closing', label: 'Closing', kind: 'number', get: (s) => s.closing_cash },
    { key: 'variance', label: 'Variance', kind: 'number', get: (s) => s.variance },
    ...(showForceClose ? [{ key: 'actions', label: '' }] : []),
  ], 'shifts');

  if (rows.length === 0) return <EmptyState message="No shifts found." />;

  return (
    <TableCard>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <SortFilterHead controls={shiftCtl} allRows={rows} />
        <tbody>
          {shiftCtl.rows.map((s) => {
            const stale = isStaleOpenShift(s.opened_at, s.closed_at);
            const highlighted = highlightId != null && s.id === highlightId;
            const colSpan = 8 + (showForceClose ? 1 : 0);
            const movements = s.cash_movements ?? [];
            const floatVar = s.opening_float_variance == null ? null : Number(s.opening_float_variance);
            const hasDetail = !!(s.cash_count_breakdown || (s.foreign_currency_held?.length ?? 0) > 0 || s.cash_count_method || movements.length > 0);
            const expanded = expandedId === s.id;
            const variance = Number(s.variance ?? 0);
            const fx = s.foreign_currency_held ?? [];
            const fxSummary = fx.length
              ? fx.map((r) => `${r.currency} ${Number(r.denomination) * r.count}`).join(' · ') + ' held'
              : '';
            return (
            <Fragment key={s.id}>
            <tr
              id={highlighted ? `shift-${s.id}` : undefined}
              onClick={() => hasDetail && setExpandedId(expanded ? null : s.id)}
              style={{
                background: highlighted ? '#FEF8F2' : stale ? 'var(--color-warning-bg)' : undefined,
                outline: highlighted ? '2px solid var(--color-primary)' : undefined,
                outlineOffset: -2,
                cursor: hasDetail ? 'pointer' : undefined,
              }}
            >
              <td style={{ ...TD, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: highlighted ? 'var(--color-primary)' : 'var(--color-text)' }}>
                #{s.id}
              </td>
              <td style={{ ...TD, fontWeight: 600, color: stale ? 'var(--color-warning-strong)' : undefined }}>
                {stale && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                {s.user_id ? (
                  <Link to={`/staff?staff=${s.user_id}`} style={{ color: stale ? 'var(--color-warning-strong)' : 'var(--color-primary)', textDecoration: 'none' }}>
                    {s.user?.name ?? `#${s.user_id}`}
                  </Link>
                ) : (
                  s.user?.name ?? '—'
                )}
              </td>
              <td style={TD}>{s.device?.name ?? '—'}</td>
              <td style={{ ...TD, fontSize: 12, color: stale ? 'var(--color-warning-strong)' : 'var(--color-text-muted)' }}>{new Date(s.opened_at).toLocaleString()}</td>
              <td style={{ ...TD, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {s.closed_at ? new Date(s.closed_at).toLocaleString() : stale ? 'Still open — close shift' : '—'}
              </td>
              <td style={TD}>
                {formatMVR(s.opening_cash)}
                {floatVar != null && Math.abs(floatVar) >= 0.01 && (
                  <div data-testid={`float-variance-${s.id}`} style={{ fontSize: 11, color: 'var(--color-danger)', fontWeight: 600, marginTop: 2 }}>
                    {floatVar < 0 ? 'Short' : 'Over'} {formatMVR(Math.abs(floatVar))} vs last close {formatMVR(s.opening_float_expected)}
                  </div>
                )}
              </td>
              <td style={TD}>{formatMVR(s.closing_cash)}</td>
              <td style={TD}>
                {s.variance != null ? (
                  <Badge color={Math.abs(s.variance) < 0.01 ? 'green' : 'red'}>{formatMVR(s.variance)}</Badge>
                ) : '—'}
                {fxSummary && Math.abs(variance) >= 0.01 && (
                  <div style={{ fontSize: 11, color: 'var(--color-warning-strong)', marginTop: 4, fontWeight: 600 }}>
                    {variance < 0 ? `Short ${formatMVR(Math.abs(variance))}` : `Over ${formatMVR(variance)}`}
                    {' · '}{fxSummary}
                  </div>
                )}
              </td>
              {showForceClose && (
                <td style={TD}>
                  <Btn small variant="secondary" onClick={(e) => { e.stopPropagation(); onForceClose?.(s.id); }}>Force close</Btn>
                </td>
              )}
            </tr>
            {expanded && hasDetail && (
              <tr>
                <td colSpan={colSpan} style={{ ...TD, background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <div data-testid={`shift-admin-detail-${s.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {s.cash_count_method && (
                      <div>Count method: <strong>{s.cash_count_method === 'denominations' ? 'denominations' : 'plain total'}</strong></div>
                    )}
                    {s.cash_count_breakdown && Object.keys(s.cash_count_breakdown).length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Denomination breakdown</div>
                        {Object.entries(s.cash_count_breakdown)
                          .map(([laari, count]) => ({ laari: Number(laari), count: Number(count) }))
                          .filter((r) => r.count > 0)
                          .sort((a, b) => b.laari - a.laari)
                          .map((r) => (
                            <div key={r.laari}>{denomLabel(r.laari)} × {r.count} = MVR {((r.laari * r.count) / 100).toFixed(2)}</div>
                          ))}
                      </div>
                    )}
                    {movements.length > 0 && (
                      <div data-testid={`shift-movements-${s.id}`}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Cash movements</div>
                        {movements.map((m) => (
                          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', textDecoration: m.voided_at ? 'line-through' : undefined, color: m.voided_at ? 'var(--color-text-muted)' : undefined }}>
                            <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span style={{ fontWeight: 600 }}>{m.type.replace(/_/g, ' ')}</span>
                            <span>{formatMVR(Number(m.amount))}</span>
                            <span>{m.reason ?? ''}</span>
                            {m.user?.name && <span>· {m.user.name}</span>}
                            {m.voided_at
                              ? <span style={{ textDecoration: 'none' }}>voided{m.voided_by?.name ? ` by ${m.voided_by.name}` : ''}{m.void_reason ? `: ${m.void_reason}` : ''}</span>
                              : (!s.closed_at && onVoidMovement && (
                                <Btn small variant="ghost" onClick={(e) => { e.stopPropagation(); onVoidMovement(s.id, m.id); }} aria-label={`Void movement ${m.id}`}>Void</Btn>
                              ))}
                          </div>
                        ))}
                      </div>
                    )}
                    {fx.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Foreign currency held (record only)</div>
                        {fx.map((r, i) => (
                          <div key={i}>
                            {r.currency} {Number(r.denomination)} × {r.count}
                            {' — accepted '}{formatMVR(r.accepted_mvr)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
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
  const [searchParams] = useSearchParams();
  const focusShiftId = useMemo(() => {
    const n = Number(searchParams.get('shift'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const [tab, setTab] = useState<Tab>(canViewAll ? 'live' : 'history');
  const [error, setError] = useState('');

  const [liveShifts, setLiveShifts] = useState<ShiftHistoryRow[]>([]);
  const [historyShifts, setHistoryShifts] = useState<ShiftHistoryRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [forceTarget, setForceTarget] = useState<number | null>(null);
  const [forceNotes, setForceNotes] = useState('');
  const [forceSaving, setForceSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ shiftId: number; movementId: number } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSaving, setVoidSaving] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  const handleVoid = async () => {
    if (!voidTarget || voidReason.trim().length < 3) return;
    setVoidSaving(true); setError('');
    try {
      await voidCashMovement(voidTarget.shiftId, voidTarget.movementId, voidReason.trim());
      setVoidTarget(null);
      setVoidReason('');
      await loadLive();
    } catch (e) { setError((e as Error).message); }
    finally { setVoidSaving(false); }
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
      const res = await fetchShiftHistory({ from: historyFrom || undefined, to: historyTo || undefined, limit: 200 });
      setHistoryShifts(res.shifts ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setAdminLoading(false); }
  };

  useEffect(() => {
    if (!canViewAll || focusShiftId) return;
    if (tab === 'live') void loadLive();
    if (tab === 'history') void loadHistory();
  }, [tab, canViewAll, focusShiftId]);

  useEffect(() => {
    if (!canViewAll || !focusShiftId) return;
    let cancelled = false;
    (async () => {
      setAdminLoading(true);
      setError('');
      try {
        const [liveRes, histRes] = await Promise.all([fetchLiveShifts(), fetchShiftHistory()]);
        if (cancelled) return;
        const live = liveRes.shifts ?? [];
        const hist = histRes.shifts ?? [];
        setLiveShifts(live);
        setHistoryShifts(hist);
        if (live.some((s) => s.id === focusShiftId)) setTab('live');
        else setTab('history');
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [focusShiftId, canViewAll]);

  useEffect(() => {
    if (!focusShiftId || adminLoading) return;
    const el = document.getElementById(`shift-${focusShiftId}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusShiftId, adminLoading, tab, liveShifts, historyShifts]);

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
    <PageShell>
    <div>
      <PageHeader section="Team" title="Shifts & Cash Drawer" />
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>}

      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
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
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  {liveShifts.length} open shift{liveShifts.length !== 1 ? 's' : ''} across all stations
                </p>
                <AdminShiftTable
                  rows={liveShifts}
                  showForceClose
                  highlightId={focusShiftId}
                  onForceClose={(id) => { setForceTarget(id); setForceNotes(''); }}
                  onVoidMovement={(shiftId, movementId) => { setVoidTarget({ shiftId, movementId }); setVoidReason(''); }}
                />
              </>
            )
          )}

          {tab === 'history' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  From
                  <input type="date" aria-label="Shift history from" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} style={{ ...S.input, width: 170 }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  To
                  <input type="date" aria-label="Shift history to" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} style={{ ...S.input, width: 170 }} />
                </label>
                <Btn small variant="secondary" onClick={() => void loadHistory()}>Apply</Btn>
                {(historyFrom || historyTo) && <Btn small variant="ghost" onClick={() => { setHistoryFrom(''); setHistoryTo(''); }}>Clear</Btn>}
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'center' }}>Latest 200 shifts in the range; leave both empty for the most recent.</span>
              </div>
              {adminLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
              ) : (
                <AdminShiftTable rows={historyShifts} highlightId={focusShiftId} />
              )}
            </>
          )}
        </>
      )}

      {voidTarget && (
        <Modal title="Void cash movement" onClose={() => setVoidTarget(null)} maxWidth={420}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            The movement stays on record, struck through with your reason, and stops counting towards the expected cash.
          </p>
          <label>
            <span style={S.label}>Reason</span>
            <textarea aria-label="Void reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} style={{ ...S.input, resize: 'vertical' }} placeholder="e.g. entered 150 instead of 15" />
          </label>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => void handleVoid()} disabled={voidSaving || voidReason.trim().length < 3}>{voidSaving ? 'Voiding…' : 'Void movement'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {forceTarget && (
        <Modal title="Force Close Shift" onClose={() => setForceTarget(null)} maxWidth={420}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
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

    </PageShell>
  );
}
