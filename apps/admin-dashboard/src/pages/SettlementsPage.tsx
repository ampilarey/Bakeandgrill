/**
 * Bank settlements — does the money in the bank match what the till says?
 *
 * Owner, 2026-09-07: "the system must match actual money received." Four
 * views of the same question:
 *
 *   Card & QR   one account, deposits a day or more later and sometimes in
 *               halves. A BML POS credit names the sales day it settles and
 *               is applied there; anything else goes to the oldest day still
 *               owed. A day reads settled / partly / awaiting / overdue /
 *               over (the bank paid more than the till took) and the header
 *               says what the bank still owes.
 *   Transfers   the other account, one line per customer transfer, each
 *               ticked off against the payment it was for — and flagged,
 *               with the difference, when the customer sent the wrong amount.
 *   Cash        what the owner received each day against what the shifts
 *               counted less the float that stayed in the drawer.
 *   Statements  the uploaded files, with a dry run first so the owner sees
 *               what was understood before anything is stored.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCashHandover, deleteStatementImport, fetchCardQrLedger, fetchCashHandovers, fetchSettlementSettings,
  fetchStatementImports, fetchTransferSettlements, ignoreStatementLine, matchTransferLine, restoreStatementLine,
  saveCashHandover, unmatchTransferLine, updateSettlementSettings, uploadStatement,
  type CardQrLedger, type CashDay, type CashView, type DayStatus, type ImportSummary, type SettlementAccount,
  type SettlementSettings, type StatementImport, type TransferRow, type TransfersView,
} from '../api';
import {
  Badge, Btn, Card, DateInput, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, StatCard, TableCard,
  TableSkeleton, TD, TH,
} from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { useIsMobile } from '../hooks/useIsMobile';
import { daysAgo, today } from '../utils/dateHelpers';

type TabId = 'card_qr' | 'transfers' | 'cash' | 'statements';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'card_qr', label: 'Card & QR' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'cash', label: 'Cash' },
  { id: 'statements', label: 'Statements' },
];

const mvr = (laar: number | null | undefined) =>
  laar == null ? '—' : `MVR ${(laar / 100).toLocaleString('en-MV', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS: Record<DayStatus | CashDay['status'], { label: string; color: string }> = {
  none: { label: 'No takings', color: 'gray' },
  settled: { label: 'Settled', color: 'green' },
  partial: { label: 'Partly settled', color: 'orange' },
  awaiting: { label: 'Awaiting', color: 'blue' },
  overdue: { label: 'Overdue', color: 'red' },
  over: { label: 'Bank paid more', color: 'orange' },
  differs: { label: 'Differs', color: 'red' },
};

const TRANSFER_STATUS: Record<TransferRow['status'], { label: string; color: string }> = {
  verified: { label: 'In bank', color: 'green' },
  short: { label: 'Short', color: 'red' },
  over: { label: 'Over', color: 'orange' },
  unverified: { label: 'Not seen', color: 'orange' },
};

/** A wrong-amount transfer is highlighted on its whole row. */
const mismatchRow: React.CSSProperties = { background: 'var(--color-danger-bg)' };

const signed = (laar: number) => `${laar > 0 ? '+' : '−'}${mvr(Math.abs(laar)).replace('MVR ', '')}`;

function StatusBadge({ status }: { status: DayStatus | CashDay['status'] }) {
  const s = STATUS[status] ?? STATUS.none;
  return <Badge color={s.color}>{s.label}</Badge>;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
  background: active ? 'var(--color-surface)' : 'transparent',
  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none', whiteSpace: 'nowrap',
});

export function SettlementsPage() {
  usePageTitle('Bank Settlements');
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabId>('card_qr');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [error, setError] = useState('');

  return (
    <PageShell>
      <PageHeader
        section="Finance"
        title="Bank Settlements"
        subtitle="Does the money in the bank match what the till says?"
      />
      {error && <ErrorMsg message={error} />}

      <div role="tablist" aria-label="Settlements" style={{
        display: 'flex', gap: 4, marginBottom: 16, background: 'var(--color-bg)',
        borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', overflowX: 'auto',
      }}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={tabStyle(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'statements' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <DateInput label="From" value={from} onChange={setFrom} max={to} />
          <DateInput label="To" value={to} onChange={setTo} max={today()} />
        </div>
      )}

      {tab === 'card_qr' && <CardQrTab from={from} to={to} isMobile={isMobile} onError={setError} />}
      {tab === 'transfers' && <TransfersTab from={from} to={to} isMobile={isMobile} onError={setError} />}
      {tab === 'cash' && <CashTab from={from} to={to} isMobile={isMobile} onError={setError} />}
      {tab === 'statements' && <StatementsTab onError={setError} />}
    </PageShell>
  );
}

// ── Card & QR ──────────────────────────────────────────────────────────────

function CardQrTab({ from, to, isMobile, onError }: { from: string; to: string; isMobile: boolean; onError: (m: string) => void }) {
  const [ledger, setLedger] = useState<CardQrLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeposits, setShowDeposits] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLedger(await fetchCardQrLedger(from, to)); onError(''); }
    catch (e) { onError((e as Error).message); }
    finally { setLoading(false); }
  }, [from, to, onError]);

  useEffect(() => { void load(); }, [load]);

  const restore = async (id: number) => {
    try { await restoreStatementLine(id); await load(); } catch (e) { onError((e as Error).message); }
  };

  if (loading || !ledger) return <TableSkeleton rows={6} cols={6} />;
  const t = ledger.totals;
  const depositedSub = t.over_days > 0
    ? `${mvr(t.over_laar)} more than the till took on ${t.over_days} day${t.over_days === 1 ? '' : 's'}`
    : t.excess_laar > 0 ? `${mvr(t.excess_laar)} not explained by any day` : 'all applied to takings';

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Bank still owes" value={mvr(t.outstanding_laar)} accent={t.outstanding_laar > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          sub={t.oldest_open_date ? `oldest open day ${t.oldest_open_date}` : 'everything has arrived'} />
        <StatCard label="Overdue days" value={String(t.overdue_days)} accent={t.overdue_days > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
          sub={`owed for more than ${ledger.settings.alert_days} days`} />
        <StatCard label="Expected in window" value={mvr(t.expected_laar)} sub="card + QR, net of commission" />
        <StatCard label="Deposited in window" value={mvr(t.deposited_laar)} sub={depositedSub} accent={t.excess_laar > 0 || t.over_days > 0 ? 'var(--color-warning)' : undefined} />
      </div>

      {!ledger.start && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          Tracking from the first card or QR payment on record. Set a start date under Statements → Settings to ignore older days.
        </p>
      )}

      <div style={{ marginBottom: 10 }}>
        <Btn small variant="secondary" onClick={() => setShowDeposits((v) => !v)}>
          {showDeposits ? 'Show days' : `Show deposits (${ledger.deposits.length})`}
        </Btn>
      </div>

      {!showDeposits ? (
        isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {ledger.days.filter((d) => d.status !== 'none').map((d) => (
              <article key={d.date} data-testid={`ledger-day-${d.date}`} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{d.date}</strong><StatusBadge status={d.status} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Expected {mvr(d.expected_laar)} · arrived {mvr(d.allocated_laar)}
                  {d.remaining_laar > 0 ? ` · still owed ${mvr(d.remaining_laar)}` : ''}
                  {d.over_laar > 0 ? ` · ${mvr(d.over_laar)} more than the till took` : ''}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Day', 'Takings', 'Commission', 'Expected', 'Arrived', 'Still owed', 'Status'].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {ledger.days.map((d) => (
                  <tr key={d.date} data-testid={`ledger-day-${d.date}`} style={{ opacity: d.status === 'none' ? 0.5 : 1, ...(d.status === 'over' ? mismatchRow : {}) }}>
                    <td style={TD}>{d.date}{d.payments > 0 ? <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}> · {d.payments} payment{d.payments === 1 ? '' : 's'}</span> : null}</td>
                    <td style={TD}>{mvr(d.gross_laar)}</td>
                    <td style={TD}>{d.commission_laar ? `−${mvr(d.commission_laar)}` : '—'}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{mvr(d.expected_laar)}</td>
                    <td style={TD}>
                      {mvr(d.allocated_laar)}
                      {d.deposits.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {d.deposits.map((x) => `${x.date}: ${mvr(x.amount_laar)}`).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td style={{ ...TD, color: d.remaining_laar > 0 ? 'var(--color-danger)' : d.over_laar > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                      {d.remaining_laar > 0 ? mvr(d.remaining_laar) : d.over_laar > 0 ? `+${mvr(d.over_laar)}` : '—'}
                    </td>
                    <td style={TD}><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )
      ) : (
        <>
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Deposit date', 'For sales of', 'Description', 'Amount', 'Applied to', 'Unexplained'].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {ledger.deposits.length === 0 && <tr><td style={TD} colSpan={6}>No deposits in this window. Upload the card & QR account statement under Statements.</td></tr>}
                {ledger.deposits.map((d) => (
                  <tr key={d.id} data-testid={`deposit-${d.id}`}>
                    <td style={TD}>{d.date}</td>
                    <td style={TD}>{d.for_date ?? <span style={{ color: 'var(--color-text-muted)' }}>oldest open day</span>}</td>
                    <td style={TD}>{d.description ?? '—'}{d.reference ? <span style={{ color: 'var(--color-text-muted)' }}> · {d.reference}</span> : null}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{mvr(d.amount_laar)}</td>
                    <td style={{ ...TD, fontSize: 12 }}>{d.applied_to.map((a) => `${a.date}: ${mvr(a.amount_laar)}`).join(' · ') || '—'}</td>
                    <td style={{ ...TD, color: d.excess_laar > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{d.excess_laar > 0 ? mvr(d.excess_laar) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          {ledger.set_aside.length > 0 && (
            <Card>
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13 }}>Other credits in this account — not counted</p>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                The bank did not label these as POS settlements (a top-up, a refund from a supplier). If one was a settlement after all, count it.
              </p>
              <div style={{ display: 'grid', gap: 6 }}>
                {ledger.set_aside.map((l) => (
                  <div key={l.id} data-testid={`set-aside-${l.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                    <span style={{ minWidth: 90 }}>{l.date}</span>
                    <span style={{ flex: 1, minWidth: 140 }}>{l.description ?? '—'}{l.reference ? ` · ${l.reference}` : ''}</span>
                    <strong>{mvr(l.amount_laar)}</strong>
                    <Btn small variant="ghost" onClick={() => void restore(l.id)}>Count it</Btn>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

// ── Transfers ──────────────────────────────────────────────────────────────

function TransfersTab({ from, to, isMobile, onError }: { from: string; to: string; isMobile: boolean; onError: (m: string) => void }) {
  const [view, setView] = useState<TransfersView | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState<number | null>(null); // line id being matched

  const load = useCallback(async () => {
    setLoading(true);
    try { setView(await fetchTransferSettlements(from, to)); onError(''); }
    catch (e) { onError((e as Error).message); }
    finally { setLoading(false); }
  }, [from, to, onError]);

  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e) { onError((e as Error).message); }
  };

  if (loading || !view) return <TableSkeleton rows={6} cols={5} />;
  const t = view.totals;
  const unverified = view.payments.filter((p) => p.status === 'unverified');
  const mismatchNet = t.over_laar - t.short_laar;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Transfers" value={`${t.verified} / ${t.payments}`} sub="verified to the laari" accent={t.verified === t.payments ? 'var(--color-success)' : undefined} />
        <StatCard label="Wrong amounts" value={String(t.mismatched)} accent={t.mismatched > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
          sub={t.mismatched > 0 ? `${mvr(t.short_laar)} short · ${mvr(t.over_laar)} over · net ${signed(mismatchNet)}` : 'every transfer seen matched its sale'} />
        <StatCard label="Not yet seen in bank" value={mvr(t.unverified_laar)} accent={t.unverified_laar > 0 ? 'var(--color-warning)' : 'var(--color-success)'} />
        <StatCard label="Bank lines unclaimed" value={String(t.unmatched_lines)} sub="credits no sale explains" accent={t.unmatched_lines > 0 ? 'var(--color-warning)' : undefined} />
      </div>

      {view.unmatched_lines.length > 0 && (
        <Card>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13 }}>Bank credits nobody has claimed</p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>Match each to the transfer payment it was for — the amount may differ if the customer sent the wrong sum — or set it aside if it was not a sale (interest, a supplier refund).</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {view.unmatched_lines.map((l) => (
              <div key={l.id} data-testid={`unmatched-line-${l.id}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}>
                <span style={{ minWidth: 90 }}>{l.for_date ?? l.date}{l.for_date && l.for_date !== l.date ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> · posted {l.date}</span> : null}</span>
                <span style={{ flex: 1, minWidth: 140 }}>{l.counterparty ?? l.description ?? '—'}{l.reference ? <span style={{ color: 'var(--color-text-muted)' }}> · {l.reference}</span> : null}</span>
                <strong>{mvr(l.amount_laar)}</strong>
                <Btn small onClick={() => setMatching(l.id)}>Match…</Btn>
                <Btn small variant="ghost" onClick={() => void act(() => ignoreStatementLine(l.id))}>Not a sale</Btn>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ marginTop: 16 }}>
        {isMobile ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {view.payments.map((p) => (
              <article key={p.payment_id} data-testid={`transfer-${p.payment_id}`} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--color-surface)', ...(p.difference_laar ? mismatchRow : {}) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{mvr(p.amount_laar)}</strong>
                  <TransferBadge p={p} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {p.at.slice(0, 10)} · {p.order_number ?? p.invoice_number ?? '—'}{p.customer ? ` · ${p.customer}` : ''}{p.reference ? ` · ref ${p.reference}` : ''}
                </div>
                {p.line && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>Bank: {mvr(p.line.amount_laar)} from {p.line.counterparty ?? p.line.description ?? '—'} on {p.line.for_date ?? p.line.date}</div>}
              </article>
            ))}
          </div>
        ) : (
          <TableCard>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Paid', 'Order / invoice', 'Customer', 'Reference', 'Amount', 'Bank received', 'Difference', 'Bank', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {view.payments.length === 0 && <tr><td style={TD} colSpan={9}>No transfer payments in this window.</td></tr>}
                {view.payments.map((p) => (
                  <tr key={p.payment_id} data-testid={`transfer-${p.payment_id}`} style={p.difference_laar ? mismatchRow : undefined}>
                    <td style={TD}>{p.at.slice(0, 10)}</td>
                    <td style={TD}>{p.order_number ?? p.invoice_number ?? '—'}</td>
                    <td style={TD}>{p.customer ?? '—'}</td>
                    <td style={TD}>{p.reference ?? '—'}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{mvr(p.amount_laar)}</td>
                    <td style={TD}>
                      {p.line ? mvr(p.line.amount_laar) : '—'}
                      {p.line && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.line.for_date ?? p.line.date} · {p.line.counterparty ?? p.line.description ?? ''}{p.line.match_status === 'manual' ? ' · matched by hand' : ''}</div>}
                    </td>
                    <td style={{ ...TD, fontWeight: p.difference_laar ? 700 : 400, color: p.difference_laar ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                      {p.difference_laar ? signed(p.difference_laar) : '—'}
                    </td>
                    <td style={TD}><TransferBadge p={p} /></td>
                    <td style={TD}>{p.line && <Btn small variant="ghost" onClick={() => void act(() => unmatchTransferLine(p.line!.id))}>Unmatch</Btn>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>

      {matching !== null && (
        <Modal title="Which transfer was this for?" onClose={() => setMatching(null)}>
          {unverified.length === 0 ? (
            <p style={{ fontSize: 13 }}>Every transfer in this window is already accounted for. Widen the dates, or set this line aside as not a sale.</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {unverified.map((p) => (
                <button
                  key={p.payment_id}
                  type="button"
                  data-testid={`pick-payment-${p.payment_id}`}
                  onClick={() => { const id = matching; setMatching(null); void act(() => matchTransferLine(id, p.payment_id)); }}
                  style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: 13 }}
                >
                  <strong>{mvr(p.amount_laar)}</strong> · {p.at.slice(0, 10)} · {p.order_number ?? p.invoice_number ?? '—'}{p.customer ? ` · ${p.customer}` : ''}{p.reference ? ` · ref ${p.reference}` : ''}
                </button>
              ))}
            </div>
          )}
          <ModalActions><Btn variant="secondary" onClick={() => setMatching(null)}>Cancel</Btn></ModalActions>
        </Modal>
      )}
    </>
  );
}

function TransferBadge({ p }: { p: TransferRow }) {
  const s = TRANSFER_STATUS[p.status] ?? TRANSFER_STATUS.unverified;
  const label = p.difference_laar ? `${s.label} by ${mvr(Math.abs(p.difference_laar)).replace('MVR ', '')}` : s.label;
  return <Badge color={s.color}>{label}</Badge>;
}

// ── Cash ───────────────────────────────────────────────────────────────────

function CashTab({ from, to, isMobile, onError }: { from: string; to: string; isMobile: boolean; onError: (m: string) => void }) {
  const [view, setView] = useState<CashView | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CashDay | null>(null);
  const [amount, setAmount] = useState('');
  const [floatKept, setFloatKept] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setView(await fetchCashHandovers(from, to)); onError(''); }
    catch (e) { onError((e as Error).message); }
    finally { setLoading(false); }
  }, [from, to, onError]);

  useEffect(() => { void load(); }, [load]);

  const open = (d: CashDay) => {
    setEditing(d);
    setAmount(d.received_laar != null ? (d.received_laar / 100).toFixed(2) : (d.expected_handover_laar / 100).toFixed(2));
    setFloatKept(d.float_source === 'entered' ? (d.float_kept_laar / 100).toFixed(2) : '');
    setNotes(d.notes ?? '');
  };

  const save = async () => {
    if (!editing) return;
    const n = parseFloat(amount);
    if (!(n >= 0)) { onError('Enter the amount received.'); return; }
    setSaving(true);
    try {
      await saveCashHandover(editing.date, {
        amount: n,
        float_kept: floatKept.trim() === '' ? null : parseFloat(floatKept),
        notes: notes.trim() || null,
      });
      setEditing(null);
      await load();
    } catch (e) { onError((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading || !view) return <TableSkeleton rows={6} cols={6} />;
  const t = view.totals;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Should have received" value={mvr(t.expected_handover_laar)} sub="counted cash less the float kept" />
        <StatCard label="Received" value={mvr(t.received_laar)} accent={t.received_laar >= t.expected_handover_laar ? 'var(--color-success)' : 'var(--color-warning)'} />
        <StatCard label="Days not entered" value={String(t.awaiting_days)} accent={t.awaiting_days > 0 ? 'var(--color-warning)' : 'var(--color-success)'} />
        <StatCard label="Days that differ" value={String(t.differs_days)} accent={t.differs_days > 0 ? 'var(--color-danger)' : 'var(--color-success)'} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
        Enter what the owner actually took, not the drawer total. The float that stays for tomorrow is taken from the shifts' opening cash unless you type it.
      </p>

      {isMobile ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {view.days.filter((d) => d.status !== 'none').map((d) => (
            <article key={d.date} data-testid={`cash-day-${d.date}`} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 12px', background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{d.date}</strong><StatusBadge status={d.status} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                Counted {mvr(d.counted_laar)} · float {mvr(d.float_kept_laar)} · expected {mvr(d.expected_handover_laar)}
                {d.received_laar != null ? ` · received ${mvr(d.received_laar)}` : ''}
              </div>
              <div style={{ marginTop: 8 }}><Btn small onClick={() => open(d)}>{d.received_laar != null ? 'Edit' : 'Enter received'}</Btn></div>
            </article>
          ))}
        </div>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Day', 'Shifts', 'Counted', 'Till variance', 'Float kept', 'Should receive', 'Received', 'Difference', 'Status', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {view.days.map((d) => (
                <tr key={d.date} data-testid={`cash-day-${d.date}`} style={{ opacity: d.status === 'none' ? 0.5 : 1 }}>
                  <td style={TD}>{d.date}</td>
                  <td style={TD}>{d.shifts || '—'}</td>
                  <td style={TD}>{d.shifts ? mvr(d.counted_laar) : '—'}</td>
                  <td style={{ ...TD, color: d.till_variance_laar !== 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{d.shifts ? mvr(d.till_variance_laar) : '—'}</td>
                  <td style={TD}>{d.shifts ? mvr(d.float_kept_laar) : '—'}{d.float_source === 'entered' ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}> · typed</span> : null}</td>
                  <td style={{ ...TD, fontWeight: 600 }}>{d.shifts ? mvr(d.expected_handover_laar) : '—'}</td>
                  <td style={TD}>{d.received_laar != null ? mvr(d.received_laar) : '—'}{d.received_by ? <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{d.received_by}</div> : null}</td>
                  <td style={{ ...TD, color: d.difference_laar ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{d.difference_laar != null && d.difference_laar !== 0 ? mvr(d.difference_laar) : '—'}</td>
                  <td style={TD}><StatusBadge status={d.status} /></td>
                  <td style={TD}>
                    {(d.shifts > 0 || d.received_laar != null) && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Btn small variant="secondary" onClick={() => open(d)}>{d.received_laar != null ? 'Edit' : 'Enter'}</Btn>
                        {d.received_laar != null && <Btn small variant="ghost" onClick={() => { void deleteCashHandover(d.date).then(load).catch((e) => onError((e as Error).message)); }}>Clear</Btn>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal title={`Cash received — ${editing.date}`} onClose={() => setEditing(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Shifts counted <strong>{mvr(editing.counted_laar)}</strong>. Float kept for tomorrow <strong>{mvr(editing.float_kept_laar)}</strong>
              {editing.float_source === 'shift_opening' ? ' (the shifts’ opening cash)' : ''}. The owner should have received <strong>{mvr(editing.expected_handover_laar)}</strong>.
            </div>
            <Input label="Amount received (MVR)" type="number" value={amount} onChange={setAmount} data-testid="cash-amount" />
            <Input label="Float left in the drawer (MVR) — leave blank to use the shifts' opening cash" type="number" value={floatKept} onChange={setFloatKept} data-testid="cash-float" />
            <Input label="Notes" value={notes} onChange={setNotes} />
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </>
  );
}

// ── Statements ─────────────────────────────────────────────────────────────

function StatementsTab({ onError }: { onError: (m: string) => void }) {
  const [imports, setImports] = useState<StatementImport[] | null>(null);
  const [settings, setSettings] = useState<SettlementSettings | null>(null);
  const [account, setAccount] = useState<SettlementAccount>('card_qr');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [startDate, setStartDate] = useState('');
  const [tolerance, setTolerance] = useState('1');
  const [alertDays, setAlertDays] = useState('3');

  const load = useCallback(async () => {
    try {
      const [i, s] = await Promise.all([fetchStatementImports(), fetchSettlementSettings()]);
      setImports(i.imports);
      setSettings(s);
      setStartDate(s.start_date ?? '');
      setTolerance(String(s.tolerance));
      setAlertDays(String(s.alert_days));
      onError('');
    } catch (e) { onError((e as Error).message); }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const check = async () => {
    if (!file) { onError('Choose the statement file first.'); return; }
    setBusy(true);
    try { setSummary((await uploadStatement(account, file, true)).summary); onError(''); }
    catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadStatement(account, file, false);
      setSummary(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onError('');
      await load();
      setSummary({ ...res.summary });
    } catch (e) { onError((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveSettings = async () => {
    try {
      setSettings(await updateSettlementSettings({
        start_date: startDate || null,
        tolerance: parseFloat(tolerance) || 0,
        alert_days: Math.max(1, parseInt(alertDays, 10) || 3),
      }));
      onError('');
    } catch (e) { onError((e as Error).message); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14 }}>Upload a bank statement</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          The BML CSV export as downloaded, or any CSV / XLS / XLSX with a header row. Only credits are read. A file uploaded twice counts once. Check first, then confirm.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Account
            <select aria-label="Account" value={account} onChange={(e) => setAccount(e.target.value as SettlementAccount)} style={{ minHeight: 40, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 10px' }}>
              {(settings?.accounts ?? [{ key: 'card_qr', label: 'Card & QR account' }, { key: 'transfer', label: 'Transfer account' }]).map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Statement file
            <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx" aria-label="Statement file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSummary(null); }} />
          </label>
          <Btn onClick={() => void check()} disabled={busy || !file}>Check file</Btn>
        </div>

        {summary && (
          <div data-testid="import-summary" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-bg)', fontSize: 13 }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
              {summary.import_id ? 'Imported' : 'Ready to import'} — {summary.account_label}, {summary.filename}
            </p>
            <p style={{ margin: 0 }}>
              {summary.new_lines} new credit line{summary.new_lines === 1 ? '' : 's'} totalling <strong>{mvr(summary.credit_total_laar)}</strong>
              {summary.date_from ? ` (${summary.date_from} to ${summary.date_to})` : ''}.
              {summary.duplicate_lines > 0 ? ` ${summary.duplicate_lines} already on file.` : ''}
              {summary.debit_lines_skipped > 0 ? ` ${summary.debit_lines_skipped} debit line${summary.debit_lines_skipped === 1 ? '' : 's'} ignored.` : ''}
              {summary.unreadable_lines > 0 ? ` ${summary.unreadable_lines} line${summary.unreadable_lines === 1 ? '' : 's'} could not be read.` : ''}
              {summary.set_aside_lines > 0 ? ` ${summary.set_aside_lines} credit${summary.set_aside_lines === 1 ? '' : 's'} not labelled POS set aside.` : ''}
              {summary.auto_matched != null ? ` ${summary.auto_matched} transfer${summary.auto_matched === 1 ? '' : 's'} matched automatically.` : ''}
              {summary.mismatched ? ` ${summary.mismatched} sent the wrong amount — see Transfers.` : ''}
              {summary.format === 'bml' ? ' BML export: each POS credit is applied to the sales day the bank names.' : ''}
            </p>
            {summary.preview.length > 0 && !summary.import_id && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 12 }}>
                <thead><tr>{['Date', 'For', 'Description', 'Amount'].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {summary.preview.map((l, i) => (
                    <tr key={i} style={{ opacity: l.set_aside ? 0.55 : 1 }}>
                      <td style={TD}>{l.txn_date}</td>
                      <td style={TD}>{l.for_date ?? '—'}</td>
                      <td style={TD}>{l.description ?? '—'}{l.reference ? ` · ${l.reference}` : ''}{l.set_aside ? ' · set aside' : ''}</td>
                      <td style={TD}>{mvr(l.amount_laar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!summary.import_id && (
              <div style={{ marginTop: 10 }}>
                <Btn onClick={() => void confirm()} disabled={busy || summary.new_lines === 0}>Import {summary.new_lines} line{summary.new_lines === 1 ? '' : 's'}</Btn>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>Uploaded statements</p>
        {imports === null ? <TableSkeleton rows={3} cols={4} /> : imports.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>None yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['When', 'Account', 'File', 'Lines', 'Credits', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id} data-testid={`import-${i.id}`}>
                  <td style={TD}>{i.created_at?.slice(0, 10) ?? '—'}{i.imported_by ? <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{i.imported_by}</div> : null}</td>
                  <td style={TD}>{i.account_label}</td>
                  <td style={TD}>{i.filename}</td>
                  <td style={TD}>{i.line_count}{i.duplicate_count ? <span style={{ color: 'var(--color-text-muted)' }}> (+{i.duplicate_count} dup)</span> : null}</td>
                  <td style={TD}>{mvr(i.credit_total_laar)}</td>
                  <td style={TD}><Btn small variant="ghost" onClick={() => { void deleteStatementImport(i.id).then(load).catch((e) => onError((e as Error).message)); }}>Remove</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>Settings</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateInput label="Track from" value={startDate} onChange={setStartDate} />
          <Input label="Tolerance (MVR)" type="number" value={tolerance} onChange={setTolerance} style={{ width: 120 }} />
          <Input label="Overdue after (days)" type="number" value={alertDays} onChange={setAlertDays} style={{ width: 120 }} />
          <Btn variant="secondary" onClick={() => void saveSettings()}>Save settings</Btn>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Days before the start date are not tracked. A difference within the tolerance counts as settled. A day still owed after the overdue window is flagged.
        </p>
      </Card>
    </div>
  );
}
