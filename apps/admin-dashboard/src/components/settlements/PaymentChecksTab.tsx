/**
 * Check payments: each QR and card payment ticked against what really came in
 * (owner, 2026-10-28). A QR customer types the bill amount themselves and the
 * cashier keys the card machine by hand, and the cashier cannot see MPOS, so
 * the owner compares here: Matches, or Different with the amount MPOS or the
 * slip shows; a transfer against the bank app (owner, 2026-10-29), or the
 * bank statement once it matched it on the Transfers tab. A check never changes the payment; a short one is chased and
 * fixed on the order. Cash is checked by the shift count, transfers on the
 * Transfers tab.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Search, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchPaymentChecks, markPaymentCheck, markPaymentChecksMatched, setPaymentCheckStart, undoPaymentCheck,
  type PaymentCheckRow, type PaymentCheckSort, type PaymentCheckState, type PaymentChecksView,
} from '../../api';
import { Badge, Btn, DateInput, EmptyState, InlineIcon, Modal, ModalActions, TabScrollRow, TableSkeleton } from '../SharedUI';
import { daysAgo, localISO, monthStart, today } from '../../utils/dateHelpers';
import { inputFont } from '../../utils/cssVars';

const mvr = (laar: number) => `MVR ${(laar / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

const field: React.CSSProperties = {
  minHeight: 44, fontSize: 16, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
};

const chip = (on: boolean): React.CSSProperties => ({
  minHeight: 32, padding: '0 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? 'var(--color-tone-rust-border)' : 'var(--color-border)'}`,
  background: on ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)',
  color: on ? 'var(--color-tone-rust-text)' : 'var(--color-text-secondary)',
});

const METHOD_WORD: Record<PaymentCheckRow['method'], string> = { qr: 'QR', card: 'Card', transfer: 'Transfer' };

const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' };

/** "Paid MVR 5.00 less" / "more", from what was seen less what the till recorded. */
export function diffWords(diffLaar: number): string {
  if (diffLaar === 0) return 'Same amount';
  return `Paid ${mvr(Math.abs(diffLaar))} ${diffLaar < 0 ? 'less' : 'more'}`;
}

type Method = '' | 'qr' | 'card' | 'transfer';

const shortDate = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dayKey = (iso: string) => localISO(new Date(iso));
const dayWord = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeWord = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });

/** The date presets, worked out from today each time they are drawn. */
function presets(): Array<{ id: string; label: string; from: string; to: string }> {
  return [
    { id: 'today', label: 'Today', from: today(), to: today() },
    { id: 'yesterday', label: 'Yesterday', from: daysAgo(1), to: daysAgo(1) },
    { id: '7d', label: 'Last 7 days', from: daysAgo(6), to: today() },
    { id: 'month', label: 'This month', from: monthStart(), to: today() },
    { id: '30d', label: 'Last 30 days', from: daysAgo(30), to: today() },
  ];
}

const card: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: 14, padding: 12 };

/*
 * Owner, 2026-10-29: "can u enhance the layout, now its a mess, make mobile 1st … instead of 3
 * column how about 1 and make filters easy". One column, phone first: dates as presets with Custom
 * behind them, one summary whose QR / Card / Transfer parts are the method filter, four state
 * chips, a search box and everything else under Filters; the list runs day by day, the way MPOS
 * and the card machine's batch report read, so a day can be ticked off in one go.
 */
export function PaymentChecksTab({ from, to, onRange, onError }: {
  from: string; to: string; onRange: (from: string, to: string) => void; onError: (m: string) => void;
}) {
  const [state, setState] = useState<PaymentCheckState>('unchecked');
  const [method, setMethod] = useState<Method>('');
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<PaymentCheckSort>('newest');
  const [page, setPage] = useState(1);
  const [typed, setTyped] = useState({ min: '', max: '', q: '' });
  const [view, setView] = useState<PaymentChecksView | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | 'bulk' | null>(null);
  const [different, setDifferent] = useState<PaymentCheckRow | null>(null);
  const [startDraft, setStartDraft] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [custom, setCustom] = useState(false);

  // Typed boxes ask once the typing stops.
  useEffect(() => {
    const t = setTimeout(() => { setMin(typed.min); setMax(typed.max); setQ(typed.q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [typed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const v = await fetchPaymentChecks({
        from, to, state, method, user_id: userId ? Number(userId) : null, device_id: deviceId ? Number(deviceId) : null,
        min, max, q, sort, page, per_page: 100,
      });
      setView(v);
      setStartDraft((d) => d || v.range.start_date || '');
      setPicked(new Set());
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load the payments.');
    } finally {
      setLoading(false);
    }
  }, [from, to, state, method, userId, deviceId, min, max, q, sort, page, onError]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [from, to, state, method, userId, deviceId, sort]);

  const rows = useMemo(() => view?.payments ?? [], [view]);
  const open = rows.filter((r) => !r.check);
  const s = view?.summary;
  const days = useMemo(() => {
    const out: Array<{ day: string; rows: PaymentCheckRow[] }> = [];
    rows.forEach((r) => {
      const d = dayKey(r.at);
      const last = out[out.length - 1];
      if (last && last.day === d) last.rows.push(r); else out.push({ day: d, rows: [r] });
    });
    return out;
  }, [rows]);

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); await load(); } catch (e) { onError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(null); }
  };

  const bulk = async () => {
    setBusy('bulk');
    try { await markPaymentChecksMatched([...picked]); await load(); } catch (e) { onError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(null); }
  };

  const pick = (ids: number[], on: boolean) => setPicked((p) => {
    const n = new Set(p);
    ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
    return n;
  });

  const preset = presets().find((p) => p.from === from && p.to === to);
  const extra = [
    userId && { key: 'user', text: view?.choices.staff.find((u) => String(u.id) === userId)?.name ?? 'Cashier', clear: () => setUserId('') },
    deviceId && { key: 'device', text: view?.choices.stations.find((d) => String(d.id) === deviceId)?.name ?? 'Station', clear: () => setDeviceId('') },
    (typed.min || typed.max) && { key: 'amount', text: `MVR ${typed.min || '0'} to ${typed.max || 'any'}`, clear: () => setTyped((t) => ({ ...t, min: '', max: '' })) },
    sort !== 'newest' && { key: 'sort', text: SORT_WORD[sort], clear: () => setSort('newest') },
  ].filter(Boolean) as Array<{ key: string; text: string; clear: () => void }>;

  const STATES: Array<[PaymentCheckState, string]> = [
    ['unchecked', `To check${s ? ` ${s.unchecked.count}` : ''}`],
    ['different', `Different${s ? ` ${s.different.count}` : ''}`],
    ['matched', `Matches${s ? ` ${s.matched.count}` : ''}`],
    ['all', 'All'],
  ];

  return (
    <div data-testid="payment-checks" className="pc-layout">
      {/* Owner, 2026-10-29: "too much empty space" on a computer. From 1100 px the dates, summary and
          filters stand in a column of their own on the left, pinned while the list scrolls. */}
      <div className="pc-side">
      {/* Dates: presets first, two date boxes only when asked for. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <TabScrollRow fit style={{ gap: 6 }} role="tablist" aria-label="Dates">
          {presets().map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={!custom && preset?.id === p.id} style={chip(!custom && preset?.id === p.id)}
              onClick={() => { setCustom(false); onRange(p.from, p.to); }}>{p.label}</button>
          ))}
          <button type="button" role="tab" aria-selected={custom || !preset} style={chip(custom || !preset)} onClick={() => setCustom((c) => !c)}
            data-testid="payment-checks-custom">
            <InlineIcon icon={CalendarDays} />{custom || !preset ? `${shortDate(from)} – ${shortDate(to)}` : 'Pick dates'}
          </button>
        </TabScrollRow>
        {custom && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <DateInput label="From" value={from} onChange={(v) => onRange(v, to)} max={to} />
            <DateInput label="To" value={to} onChange={(v) => onRange(from, v)} max={today()} />
          </div>
        )}
      </div>

      {/* Owner, 2026-10-29: "not showing anything". The start date cut the range off without saying so. */}
      {view?.range.start_date && view.range.start_date > from && (
        <div data-testid="payment-checks-start-note" role="note" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
          background: 'var(--color-tone-rust-bg)', border: '1px solid var(--color-tone-rust-border)', color: 'var(--color-tone-rust-text)', fontSize: 13,
        }}>
          <span style={{ flex: '1 1 200px' }}>
            Checking started on {new Date(`${view.range.start_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, so payments before that day are not listed.
          </span>
          <Btn small variant="secondary" disabled={busy === -1} data-testid="payment-checks-start-from"
            onClick={() => void act(-1, async () => { await setPaymentCheckStart(from); setStartDraft(from); })}>
            Also check from {shortDate(from)}
          </Btn>
        </div>
      )}

      {/* One summary: what is left to check, and the three ways in, each a filter. */}
      {s && (
        <div style={card} data-testid="payment-checks-summary">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 }}>
            <strong style={{ fontSize: 24, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{mvr(s.unchecked.laar)}</strong>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>to check · {s.unchecked.count} payment{s.unchecked.count === 1 ? '' : 's'}</span>
          </div>
          {s.different.count > 0 && (
            <button type="button" onClick={() => setState('different')} style={{
              marginTop: 8, display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '6px 10px', borderRadius: 10, background: 'var(--color-danger-bg)', color: 'var(--color-danger-strong)',
              border: '1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)',
            }}>
              {s.different.count} different · {diffWords(s.different.diff_laar).replace('Paid ', '')} in all
            </button>
          )}
          <div role="tablist" aria-label="Paid by" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 10 }}>
            {(['qr', 'card', 'transfer'] as const).map((m) => {
              const on = method === m;
              return (
                <button key={m} type="button" role="tab" aria-selected={on} aria-label={METHOD_WORD[m]} onClick={() => setMethod(on ? '' : m)} style={{
                  textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: '8px 10px', borderRadius: 10, minWidth: 0,
                  border: `1px solid ${on ? 'var(--color-tone-rust-border)' : 'var(--color-border-light)'}`,
                  background: on ? 'var(--color-tone-rust-bg)' : 'var(--color-bg)',
                }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: on ? 'var(--color-tone-rust-text)' : 'var(--color-text-secondary)' }}>{METHOD_WORD[m]}</span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={mvr(s[m].laar)}>{mvr(s[m].laar).replace('MVR\u00a0', '')}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>{s[m].unchecked} to check</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* State, then search and Filters on one line. */}
      <TabScrollRow fit style={{ gap: 6 }} role="tablist" aria-label="Show">
        {STATES.map(([id, text]) => (
          <button key={id} type="button" role="tab" aria-selected={state === id} style={chip(state === id)} onClick={() => setState(id)}>{text}</button>
        ))}
      </TabScrollRow>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
          <Search size={16} aria-hidden style={{ position: 'absolute', left: 10, top: 14, color: 'var(--color-text-muted)' }} />
          <input type="search" aria-label="Order # or reference" placeholder="Order # or reference" value={typed.q}
            onChange={(e) => setTyped((t) => ({ ...t, q: e.target.value }))} style={inputFont({ ...field, paddingLeft: 34 })} />
        </span>
        <Btn variant="secondary" onClick={() => setFiltersOpen(true)} data-testid="payment-checks-filters">
          <InlineIcon icon={SlidersHorizontal} />Filters{extra.length ? ` · ${extra.length}` : ''}
        </Btn>
      </div>
      {extra.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {extra.map((f) => (
            <button key={f.key} type="button" onClick={f.clear} aria-label={`Remove ${f.text}`} style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {f.text}<X size={14} aria-hidden />
            </button>
          ))}
        </div>
      )}

      </div>

      <div className="pc-main">
      {/* The list, one column, day by day. */}
      {loading && !view ? <TableSkeleton rows={5} cols={2} /> : rows.length === 0 ? (
        <EmptyState message={state === 'unchecked' ? 'Nothing to check in these days. Good job.' : 'No payments match.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: loading ? 0.6 : 1 }}>
          {open.length > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', minHeight: 32 }}>
              <input type="checkbox" checked={picked.size === open.length} onChange={(e) => pick(open.map((r) => r.id), e.target.checked)} />
              Pick all {open.length} shown
            </label>
          )}
          {days.map(({ day, rows: dayRows }) => {
            const dayOpen = dayRows.filter((r) => !r.check).map((r) => r.id);
            const all = dayOpen.length > 0 && dayOpen.every((id) => picked.has(id));
            return (
              <section key={day} data-testid={`payment-checks-day-${day}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 2px' }}>
                  {dayOpen.length > 0 && (
                    <input type="checkbox" checked={all} onChange={(e) => pick(dayOpen, e.target.checked)} aria-label={`Pick ${dayWord(day)}`} />
                  )}
                  <strong style={{ fontSize: 14, color: 'var(--color-text)' }}>{dayWord(day)}</strong>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {dayRows.length} · {mvr(dayRows.reduce((t, r) => t + r.amount_laar, 0))}
                  </span>
                </div>
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  {dayRows.map((r, i) => (
                    <PaymentRow key={r.id} r={r} first={i === 0} busy={busy === r.id} picked={picked.has(r.id)}
                      onPick={(on) => pick([r.id], on)}
                      onMatch={() => void act(r.id, () => markPaymentCheck(r.id, { result: 'matched' }))}
                      onDifferent={() => setDifferent(r)}
                      onUndo={() => void act(r.id, () => undoPaymentCheck(r.id))} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {view && view.meta.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <Btn small variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Page {view.meta.page} of {view.meta.last_page}</span>
          <Btn small variant="secondary" disabled={page >= view.meta.last_page} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
        </div>
      )}

      {/* Picked payments: one bar along the bottom of the screen. */}
      {picked.size > 0 && (
        <div style={{
          position: 'sticky', bottom: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '8px 12px', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-tone-rust-border)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
        }}>
          <span style={{ flex: '1 1 auto', fontSize: 13, color: 'var(--color-text)' }}>
            {picked.size} picked · {mvr(rows.filter((r) => picked.has(r.id)).reduce((t, r) => t + r.amount_laar, 0))}
          </span>
          <Btn small variant="ghost" onClick={() => setPicked(new Set())}>Clear</Btn>
          <Btn small disabled={busy === 'bulk'} onClick={() => void bulk()} data-testid="payment-checks-bulk">
            <InlineIcon icon={Check} />{busy === 'bulk' ? '…' : `Mark ${picked.size} as matching`}
          </Btn>
        </div>
      )}

      </div>

      {filtersOpen && (
        <Modal title="Filters" onClose={() => setFiltersOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={label}>Cashier
              <select value={userId} onChange={(e) => setUserId(e.target.value)} style={inputFont(field)}>
                <option value="">Everyone</option>
                {view?.choices.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label style={label}>Station
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} style={inputFont(field)}>
                <option value="">Every station</option>
                {view?.choices.stations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={label}>Amount from (MVR)
                <input inputMode="decimal" value={typed.min} onChange={(e) => setTyped((t) => ({ ...t, min: e.target.value.replace(/[^\d.]/g, '') }))} style={inputFont(field)} />
              </label>
              <label style={label}>Amount to (MVR)
                <input inputMode="decimal" value={typed.max} onChange={(e) => setTyped((t) => ({ ...t, max: e.target.value.replace(/[^\d.]/g, '') }))} style={inputFont(field)} />
              </label>
            </div>
            <label style={label}>Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as PaymentCheckSort)} style={inputFont(field)}>
                {(Object.keys(SORT_WORD) as PaymentCheckSort[]).map((k) => <option key={k} value={k}>{SORT_WORD[k]}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--color-border-light)' }}>
              <DateInput label="Ask about payments from" value={startDraft} onChange={setStartDraft} />
              <Btn small variant="secondary" disabled={!startDraft || startDraft === view?.range.start_date}
                onClick={() => void act(-1, () => setPaymentCheckStart(startDraft))}>Save</Btn>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: '1 1 100%' }}>Payments before this day are not listed or counted.</span>
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" disabled={extra.length === 0}
              onClick={() => { setUserId(''); setDeviceId(''); setTyped((t) => ({ ...t, min: '', max: '' })); setSort('newest'); }}>Clear all</Btn>
            <Btn onClick={() => setFiltersOpen(false)}>Done</Btn>
          </ModalActions>
        </Modal>
      )}

      {different && (
        <DifferentModal row={different} onClose={() => setDifferent(null)}
          onSave={async (body) => { await markPaymentCheck(different.id, { result: 'different', ...body }); setDifferent(null); await load(); }} />
      )}
    </div>
  );
}

const SORT_WORD: Record<PaymentCheckSort, string> = {
  newest: 'Newest first', oldest: 'Oldest first', amount_desc: 'Largest first', amount_asc: 'Smallest first',
};

/** One payment: tick, amount and method, the time and order, then its buttons (under it on a phone, beside it when there is room). */
function PaymentRow({ r, first, busy, picked, onPick, onMatch, onDifferent, onUndo }: {
  r: PaymentCheckRow; first: boolean; busy: boolean; picked: boolean; onPick: (on: boolean) => void;
  onMatch: () => void; onDifferent: () => void; onUndo: () => void;
}) {
  const c = r.check;
  const edge = c?.status === 'different' ? 'var(--color-danger)' : c?.status === 'matched' ? 'var(--color-success)' : 'transparent';

  return (
    <div data-testid={`payment-check-${r.id}`} style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '10px 12px',
      borderTop: first ? 'none' : '1px solid var(--color-border-light)', boxShadow: `inset 3px 0 0 ${edge}`,
      background: picked ? 'var(--color-tone-rust-bg)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: '1 1 240px', minWidth: 0 }}>
        {!c && <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={`Pick payment ${r.id}`} style={{ marginTop: 5 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 17, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{mvr(r.amount_laar)}</strong>
            <Badge color={r.method === 'qr' ? 'rust' : r.method === 'transfer' ? 'gold' : 'brown'}>{METHOD_WORD[r.method]}</Badge>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {timeWord(r.at)}
            {r.order && <> · <Link to={`/orders?order=${r.order.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>#{r.order.order_number}</Link></>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 1, overflowWrap: 'anywhere' }}>
            {[r.cashier, r.station].filter(Boolean).join(' · ') || '—'}{r.reference ? ` · Ref ${r.reference}` : ''}
          </div>
        </div>
      </div>

      {c ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '0 1 auto' }}>
          <Badge color={c.status === 'matched' ? 'green' : 'red'}>{c.status === 'matched' ? 'Matches' : diffWords(c.diff_laar)}</Badge>
          {c.status === 'different' && <span style={{ fontSize: 13, color: 'var(--color-text)' }}>Seen {mvr(c.seen_laar)}</span>}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {[c.by, c.at ? when(c.at) : null].filter(Boolean).join(' · ')}{c.reference ? ` · Ref ${c.reference}` : ''}{c.note ? ` · ${c.note}` : ''}
          </span>
          {c.source === 'statement'
            ? <Link to="/finance/settlements?view=transfers" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>On the Transfers tab</Link>
            : <Btn small variant="ghost" disabled={busy} onClick={onUndo}><InlineIcon icon={Undo2} />Undo</Btn>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto', marginLeft: 'auto' }}>
          <Btn small disabled={busy} onClick={onMatch} data-testid={`payment-check-match-${r.id}`}><InlineIcon icon={Check} />Matches</Btn>
          <Btn small variant="danger-outline" disabled={busy} onClick={onDifferent} data-testid={`payment-check-different-${r.id}`}>Different</Btn>
        </div>
      )}
    </div>
  );
}

function DifferentModal({ row, onClose, onSave }: {
  row: PaymentCheckRow; onClose: () => void;
  onSave: (body: { seen: number; reference?: string; note?: string }) => Promise<void>;
}) {
  const [seen, setSeen] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const seenLaar = seen.trim() === '' ? null : Math.round(Number(seen) * 100);
  const diff = seenLaar === null || Number.isNaN(seenLaar) ? null : seenLaar - row.amount_laar;
  const where = row.method === 'qr' ? 'MPOS' : row.method === 'transfer' ? 'the bank app' : 'the card slip';

  const save = async () => {
    if (diff === null) { setErr(`Type the amount ${where} shows.`); return; }
    if (diff === 0) { setErr('That is the same amount. Use Matches instead.'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave({ seen: (seenLaar as number) / 100, reference: reference.trim() || undefined, note: note.trim() || undefined });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <Modal title="Different amount" onClose={onClose}>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)' }}>
        The till recorded <strong style={{ color: 'var(--color-text)' }}>{mvr(row.amount_laar)}</strong> by {METHOD_WORD[row.method].toLowerCase().replace('qr', 'QR')}
        {row.order ? ` for #${row.order.order_number}` : ''}.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={label}>Amount {where} shows (MVR)
          <input autoFocus inputMode="decimal" value={seen} data-testid="payment-check-seen"
            onChange={(e) => setSeen(e.target.value.replace(/[^\d.]/g, ''))} style={inputFont(field)} />
        </label>
        {diff !== null && diff !== 0 && (
          <div data-testid="payment-check-diff" style={{ fontSize: 14, fontWeight: 700, color: diff < 0 ? 'var(--color-danger-strong)' : 'var(--color-text)' }}>
            {diffWords(diff)} than the bill
          </div>
        )}
        <label style={label}>Reference (optional)
          <input value={reference} maxLength={40} placeholder={row.method === 'card' ? 'Approval code on the slip' : 'Last digits of the transfer'}
            onChange={(e) => setReference(e.target.value)} style={inputFont(field)} />
        </label>
        <label style={label}>Note (optional)
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} style={inputFont(field)} />
        </label>
        {err && <div role="alert" style={{ fontSize: 13, color: 'var(--color-danger-strong)' }}>{err}</div>}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
          This records what you saw; the payment itself is not changed. Collect the rest, or correct the payment or refund on the order.
        </p>
      </div>
      <ModalActions>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" disabled={saving} onClick={() => void save()} data-testid="payment-check-save">{saving ? '…' : 'Save as different'}</Btn>
      </ModalActions>
    </Modal>
  );
}
