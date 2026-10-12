import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock, ExternalLink, Printer } from 'lucide-react';
import { Button } from '../ui';
import { fetchExpiringLabels, type ExpiringLabelGroup } from '../../api';

/*
 * Expiring printed stock (2026-10-12): the print log knows what was
 * stickered with which expiry, so the Pack stickers tab opens with what in
 * the freezer is near its date (and what just passed it), one row per
 * product, batch and date, with Reprint for a fresh batch. The owners get
 * the same list by text once a day (labels:check-expiring). Nothing to say,
 * nothing shown.
 */

/** "in 3 days (15 Oct)", "tomorrow", "today", "expired yesterday", "expired 2 days ago". */
export function expiryWords(g: Pick<ExpiringLabelGroup, 'days_left' | 'exp_date'>): string {
  const d = g.days_left;
  if (d > 1) return `in ${d} days (${new Date(g.exp_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`;
  if (d === 1) return 'tomorrow';
  if (d === 0) return 'today';
  if (d === -1) return 'expired yesterday';
  return `expired ${-d} days ago`;
}

const chipStyle = (d: number) => {
  const tone = d < 0 ? 'var(--color-danger)' : d <= 1 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
  return { background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone, border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)` };
};

export function ExpiringStock({ days = 7 }: { days?: number }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExpiringLabelGroup[]>([]);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    fetchExpiringLabels(days).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [days]);
  if (rows.length === 0) return null;
  const past = rows.filter((g) => g.days_left < 0).length;

  return (
    <div className="mb-5 rounded-xl border bg-[var(--color-surface)]" style={{ borderColor: 'color-mix(in srgb, var(--color-warning) 45%, transparent)' }} data-testid="expiring-stock">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <Clock size={18} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-[var(--color-text)]">Expiring printed stock ({rows.length})</span>
          <span className="block text-xs text-[var(--color-text-muted)]">Packs stickered with an expiry within {days} days{past ? `, ${past} already past it` : ''}. From the print log; the owners get this list by text each morning.</span>
        </span>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {open && (
        <ul className="divide-y divide-[var(--color-border-light)] border-t border-[var(--color-border-light)]">
          {rows.map((g) => (
            <li key={g.key} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex-1 min-w-[180px]">
                <span className="text-sm font-semibold text-[var(--color-text)]">{g.name} <span className="font-normal text-[var(--color-text-secondary)]">× {g.copies}</span></span>
                {g.kind === 'custom' && <span className="ml-2 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold bg-[var(--color-tone-brown-bg)] text-[var(--color-tone-brown-text)] border border-[var(--color-tone-brown-border)] align-middle">Custom</span>}
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {g.batch_code ? `Batch ${g.batch_code} · ` : ''}{g.mfg_date ? `made ${g.mfg_date} · ` : ''}{g.prints} {g.prints === 1 ? 'print' : 'prints'}
                </span>
              </span>
              <span className="inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap" style={chipStyle(g.days_left)} data-testid="expiry-chip">Expires {expiryWords(g)}</span>
              {g.codes[0] && (
                <a href={`/b/${g.codes[0]}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]" aria-label={`Open the pack page of ${g.name}`}>
                  <ExternalLink size={12} aria-hidden /> Pack page
                </a>
              )}
              {g.kind !== 'gone' && g.id !== null && (
                <Button size="sm" variant="secondary" icon={<Printer size={14} />} onClick={() => navigate(`/labels/stickers?${g.kind === 'custom' ? 'custom' : 'item'}=${g.id}`)} aria-label={`Reprint ${g.name}`}>Reprint</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
