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
import { Check, Search, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchPaymentChecks, markPaymentCheck, markPaymentChecksMatched, setPaymentCheckStart, undoPaymentCheck,
  type PaymentCheckRow, type PaymentCheckSort, type PaymentCheckState, type PaymentChecksView,
} from '../../api';
import { Badge, Btn, DateInput, EmptyState, InlineIcon, Modal, ModalActions, StatCard, TabScrollRow, TableSkeleton } from '../SharedUI';
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

export function PaymentChecksTab({ from, to, onError }: { from: string; to: string; onError: (m: string) => void }) {
  const [state, setState] = useState<PaymentCheckState>('unchecked');
  const [method, setMethod] = useState<'' | 'qr' | 'card' | 'transfer'>('');
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
        min, max, q, sort, page,
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

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); await load(); } catch (e) { onError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(null); }
  };

  const bulk = async () => {
    setBusy('bulk');
    try { await markPaymentChecksMatched([...picked]); await load(); } catch (e) { onError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(null); }
  };

  const STATES: Array<[PaymentCheckState, string]> = [
    ['unchecked', `Not checked${s ? ` ${s.unchecked.count}` : ''}`],
    ['different', `Different${s ? ` ${s.different.count}` : ''}`],
    ['matched', `Matches${s ? ` ${s.matched.count}` : ''}`],
    ['all', 'All'],
  ];

  return (
    <div data-testid="payment-checks">
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
        Tick each QR payment against MPOS, each card payment against the card slip and each transfer against the bank app. A transfer the bank statement matched on the Transfers tab is checked already. Cash is checked when the shift is counted.
      </p>

      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginBottom: 14 }}>
          <StatCard label="Not checked" value={mvr(s.unchecked.laar)} sub={`${s.unchecked.count} payment${s.unchecked.count === 1 ? '' : 's'}`} accent="var(--color-warning)" />
          <StatCard label="Different" value={s.different.count ? diffWords(s.different.diff_laar).replace('Paid ', '') : '—'} sub={`${s.different.count} payment${s.different.count === 1 ? '' : 's'}`} accent="var(--color-danger)" />
          <StatCard label="QR" value={mvr(s.qr.laar)} sub={`${s.qr.count} · ${s.qr.unchecked} to check`} />
          <StatCard label="Card" value={mvr(s.card.laar)} sub={`${s.card.count} · ${s.card.unchecked} to check`} />
          <StatCard label="Transfer" value={mvr(s.transfer.laar)} sub={`${s.transfer.count} · ${s.transfer.unchecked} to check`} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <TabScrollRow fit style={{ gap: 6 }} role="tablist" aria-label="Show">
          {STATES.map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={state === id} style={chip(state === id)} onClick={() => setState(id)}>{text}</button>
          ))}
        </TabScrollRow>
        <TabScrollRow fit style={{ gap: 6 }} role="tablist" aria-label="Paid by">
          {([['', 'All'], ['qr', 'QR'], ['card', 'Card'], ['transfer', 'Transfer']] as const).map(([id, text]) => (
            <button key={id || 'both'} type="button" role="tab" aria-selected={method === id} style={chip(method === id)} onClick={() => setMethod(id)}>{text}</button>
          ))}
        </TabScrollRow>
        <details data-testid="payment-checks-more" style={{ border: '1px solid var(--color-border-light)', borderRadius: 12, padding: '8px 12px', background: 'var(--color-surface)' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--color-text)', minHeight: 32, display: 'flex', alignItems: 'center' }}>More filters</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, paddingTop: 10 }}>
            <label style={label}>Order # or reference
              <span style={{ position: 'relative' }}>
                <Search size={16} aria-hidden style={{ position: 'absolute', left: 10, top: 14, color: 'var(--color-text-muted)' }} />
                <input type="search" value={typed.q} onChange={(e) => setTyped((t) => ({ ...t, q: e.target.value }))} style={inputFont({ ...field, paddingLeft: 34 })} />
              </span>
            </label>
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
            <label style={label}>Amount from (MVR)
              <input inputMode="decimal" value={typed.min} onChange={(e) => setTyped((t) => ({ ...t, min: e.target.value.replace(/[^\d.]/g, '') }))} style={inputFont(field)} />
            </label>
            <label style={label}>Amount to (MVR)
              <input inputMode="decimal" value={typed.max} onChange={(e) => setTyped((t) => ({ ...t, max: e.target.value.replace(/[^\d.]/g, '') }))} style={inputFont(field)} />
            </label>
            <label style={label}>Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as PaymentCheckSort)} style={inputFont(field)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="amount_desc">Largest first</option>
                <option value="amount_asc">Smallest first</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border-light)' }}>
            <DateInput label="Ask about payments from" value={startDraft} onChange={setStartDraft} />
            <Btn small variant="secondary" disabled={!startDraft || startDraft === view?.range.start_date}
              onClick={() => void act(-1, () => setPaymentCheckStart(startDraft))}>Save</Btn>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: '1 1 200px' }}>Payments before this day are not listed or counted.</span>
          </div>
        </details>
      </div>

      {open.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', minHeight: 32 }}>
            <input type="checkbox" checked={picked.size > 0 && picked.size === open.length}
              onChange={(e) => setPicked(e.target.checked ? new Set(open.map((r) => r.id)) : new Set())} />
            Pick all {open.length} shown
          </label>
          {picked.size > 0 && (
            <Btn small disabled={busy === 'bulk'} onClick={() => void bulk()} data-testid="payment-checks-bulk">
              <InlineIcon icon={Check} />{busy === 'bulk' ? '…' : `Mark ${picked.size} as matching`}
            </Btn>
          )}
        </div>
      )}

      {loading && !view ? <TableSkeleton rows={5} cols={4} /> : rows.length === 0 ? (
        <EmptyState message={state === 'unchecked' ? 'Nothing to check in these days. Good job.' : 'No payments match.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: 8, opacity: loading ? 0.6 : 1 }}>
          {rows.map((r) => (
            <PaymentCard key={r.id} r={r} busy={busy === r.id} picked={picked.has(r.id)}
              onPick={(on) => setPicked((p) => { const n = new Set(p); if (on) n.add(r.id); else n.delete(r.id); return n; })}
              onMatch={() => void act(r.id, () => markPaymentCheck(r.id, { result: 'matched' }))}
              onDifferent={() => setDifferent(r)}
              onUndo={() => void act(r.id, () => undoPaymentCheck(r.id))} />
          ))}
        </div>
      )}

      {view && view.meta.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0' }}>
          <Btn small variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Btn>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Page {view.meta.page} of {view.meta.last_page}</span>
          <Btn small variant="secondary" disabled={page >= view.meta.last_page} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
        </div>
      )}

      {different && (
        <DifferentModal row={different} onClose={() => setDifferent(null)}
          onSave={async (body) => { await markPaymentCheck(different.id, { result: 'different', ...body }); setDifferent(null); await load(); }} />
      )}
    </div>
  );
}

function PaymentCard({ r, busy, picked, onPick, onMatch, onDifferent, onUndo }: {
  r: PaymentCheckRow; busy: boolean; picked: boolean; onPick: (on: boolean) => void;
  onMatch: () => void; onDifferent: () => void; onUndo: () => void;
}) {
  const c = r.check;
  const edge = c?.status === 'different' ? 'color-mix(in srgb, var(--color-danger) 35%, transparent)'
    : c?.status === 'matched' ? 'color-mix(in srgb, var(--color-success) 35%, transparent)' : 'var(--color-border-light)';

  return (
    <div data-testid={`payment-check-${r.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 12, border: `1px solid ${edge}`, background: 'var(--color-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {!c && (
          <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={`Pick payment ${r.id}`} style={{ marginTop: 6 }} />
        )}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 20, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{mvr(r.amount_laar)}</strong>
            <Badge color={r.method === 'qr' ? 'rust' : r.method === 'transfer' ? 'gold' : 'brown'}>{METHOD_WORD[r.method]}</Badge>
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {when(r.at)}
            {r.order && <> · <Link to={`/orders?order=${r.order.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>#{r.order.order_number}</Link></>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {[r.cashier, r.station].filter(Boolean).join(' · ') || '—'}{r.reference ? ` · Ref ${r.reference}` : ''}
          </div>
        </div>
      </div>

      {c ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge color={c.status === 'matched' ? 'green' : 'red'}>{c.status === 'matched' ? 'Matches' : diffWords(c.diff_laar)}</Badge>
          {c.status === 'different' && <span style={{ fontSize: 13, color: 'var(--color-text)' }}>Seen {mvr(c.seen_laar)}</span>}
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flex: '1 1 140px' }}>
            {[c.by, c.at ? when(c.at) : null].filter(Boolean).join(' · ')}{c.reference ? ` · Ref ${c.reference}` : ''}{c.note ? ` · ${c.note}` : ''}
          </span>
          {c.source === 'statement'
            ? <Link to="/finance/settlements?view=transfers" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-primary)' }}>On the Transfers tab</Link>
            : <Btn small variant="ghost" disabled={busy} onClick={onUndo}><InlineIcon icon={Undo2} />Undo</Btn>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn small disabled={busy} onClick={onMatch} data-testid={`payment-check-match-${r.id}`}><InlineIcon icon={Check} />Matches</Btn>
          <Btn small variant="danger-outline" disabled={busy} onClick={onDifferent} data-testid={`payment-check-different-${r.id}`}>Different amount</Btn>
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
