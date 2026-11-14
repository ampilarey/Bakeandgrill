import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ExternalLink, Printer, Search, Tag } from 'lucide-react';
import { fetchLabelPrints, type LabelPrintRow } from '../../api';
import { Button, Card } from '../ui';
import { TabScrollRow } from '../SharedUI';
import { today } from '../../utils/dateHelpers';

/*
 * Batches (owner, 2026-11-14: "add a page to view all"): every lot of stickers printed and every box label, each
 * with the code its QR carries, newest first. One box finds a batch by its code, its batch number, the product or
 * the shop a box went to. A tap on the code opens the page a customer sees when they scan it; Print again makes a
 * new print of the same sticker.
 */

type Group = 'all' | 'stickers' | 'boxes';

const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';
const chip = (on: boolean) => ['h-8 px-3 rounded-full border text-sm font-semibold whitespace-nowrap', on ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ');
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** How a batch stands against today: past its date, close to it, or good. */
export function batchState(exp: string | null, now: string = today()): { word: string; tone: 'danger' | 'warning' | 'success' } | null {
  if (!exp) return null;
  const days = Math.round((Date.parse(`${exp}T00:00:00`) - Date.parse(`${now}T00:00:00`)) / 86_400_000);
  if (days < 0) return { word: 'Past its date', tone: 'danger' };
  if (days === 0) return { word: 'Use today', tone: 'warning' };
  if (days <= 3) return { word: `${days} ${days === 1 ? 'day' : 'days'} left`, tone: 'warning' };
  return { word: `${days} days left`, tone: 'success' };
}

function StateChip({ exp }: { exp: string | null }) {
  const s = batchState(exp);
  if (!s) return null;
  const c = `var(--color-${s.tone})`;
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 38%, transparent)` }}>{s.word}</span>;
}

export function BatchesTab() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LabelPrintRow[] | null>(null);
  const [group, setGroup] = useState<Group>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [total, setTotal] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      fetchLabelPrints({ page, group: group === 'all' ? undefined : group, q: q.trim() || undefined })
        .then((r) => { if (mine === seq.current) { setRows(r.data); setLast(r.last_page); setTotal(r.total); } })
        .catch(() => { if (mine === seq.current) setRows([]); });
    }, q.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [page, group, q]);

  const pick = (g: Group) => { setGroup(g); setPage(1); };

  return (
    <Card
      padding="none"
      header={
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-[var(--color-text)]">Batches</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Every lot of stickers and every box label printed, with the code on its QR. Tap a code to see the page a customer sees.</p>
          </div>
          <label className="relative block max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Code, batch number, product or shop" aria-label="Find a batch" className={`${fieldClass} pl-9`} data-testid="batches-search" />
          </label>
          <TabScrollRow role="group" aria-label="Show" style={{ gap: 6 }}>
            <button type="button" aria-pressed={group === 'all'} className={chip(group === 'all')} onClick={() => pick('all')}>All</button>
            <button type="button" aria-pressed={group === 'stickers'} className={chip(group === 'stickers')} onClick={() => pick('stickers')}>Stickers</button>
            <button type="button" aria-pressed={group === 'boxes'} className={chip(group === 'boxes')} onClick={() => pick('boxes')}>Box labels</button>
          </TabScrollRow>
          {rows !== null && <p className="text-xs text-[var(--color-text-muted)]" data-testid="batches-count">{total} {total === 1 ? 'batch' : 'batches'}</p>}
        </div>
      }
    >
      <ul className="divide-y divide-[var(--color-border-light)]" data-testid="batches">
        {(rows ?? []).map((r) => {
          const box = r.kind === 'box_label';
          const name = box ? (r.customer || 'Box label, written by hand') : (r.item ?? 'A label that was removed');
          return (
            <li key={r.id} className="px-4 py-3 flex flex-wrap items-start gap-3" data-testid={`batch-${r.id}`}>
              <span className="mt-0.5 w-9 h-9 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] inline-flex items-center justify-center text-[var(--color-text-muted)]">{box ? <Box size={16} aria-hidden /> : <Tag size={16} aria-hidden />}</span>
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-semibold text-[var(--color-text)]">{name}</div>
                <div className="text-xs text-[var(--color-text-secondary)] flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                  {box
                    ? <span>Box label{r.box_lines ? ` · ${r.box_lines} ${r.box_lines === 1 ? 'item' : 'items'}` : ''}{r.delivery ? ` · delivery ${r.delivery}` : ''}</span>
                    : <span>{r.copies} {r.copies === 1 ? 'sticker' : 'stickers'}{r.stock ? ` · ${r.stock}` : ''}</span>}
                  {r.batch_code ? <span className="font-semibold text-[var(--color-text)]">Batch {r.batch_code}</span> : !box && <span>No batch number</span>}
                </div>
                {!box && (
                  <div className="text-xs text-[var(--color-text-secondary)] flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                    <span>{r.mfg_date ? `Made ${day(r.mfg_date)}` : 'Dates written by hand'}{r.exp_date ? ` · use by ${day(r.exp_date)}` : ''}</span>
                    <StateChip exp={r.exp_date} />
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Printed {when(r.created_at)}{r.printed_by ? ` · ${r.printed_by}` : ''}{r.reprint_of ? ` · reprint of ${r.reprint_of}` : ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1 ml-auto">
                {r.code && r.batch_url
                  ? <a href={r.batch_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 min-h-[32px] px-3 rounded-lg border border-[var(--color-border)] text-xs font-semibold font-mono text-[var(--color-primary)]" aria-label={`Open the page of ${r.code}`} data-testid={`batch-code-${r.id}`}>{r.code}<ExternalLink size={12} aria-hidden /></a>
                  : <span className="text-xs text-[var(--color-text-muted)]">No code (printed before codes)</span>}
                {r.reprintable && r.code && (
                  <Button size="sm" variant="ghost" icon={<Printer size={14} />} onClick={() => navigate(`/labels/stickers?code=${r.code}`)} aria-label={`Print the sticker of ${r.code} again`}>Print again</Button>
                )}
              </div>
            </li>
          );
        })}
        {rows !== null && rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">{q.trim() || group !== 'all' ? 'No batch matches.' : 'Nothing printed yet. Each print of a label makes a batch here.'}</li>
        )}
      </ul>
      {last > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--color-border-light)]">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {last}</span>
          <Button variant="secondary" disabled={page >= last} onClick={() => setPage((p) => p + 1)}>Older</Button>
        </div>
      )}
    </Card>
  );
}
