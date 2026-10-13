import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Barcode, CalendarDays, FileText, Leaf, PackageOpen, Plus, QrCode, Recycle, RotateCcw, Tag, Trash2, Type } from 'lucide-react';
import type { WrapCatalogue, WrapPartKey, WrapStrips } from '../../api';
import { Btn, Modal, ModalActions } from '../SharedUI';
import { Button } from '../ui';

/*
 * Strips you can see and touch (round 2 of the usability work, owner,
 * 2026-10-13: "Still its v confusing"; before: "How to decide its 2 strips,
 * 3, or, 4"). A wrap-around label's parts as a board drawn to the label's
 * proportions: pick how many strips from thumbnails, tap a strip to choose
 * what it holds, drag one to reorder (or move it from the sheet on a phone),
 * and the same sheet opens from a tap on the strip in the live preview
 * (StripOverlay). The server says where each strip landed (WrapStrips) when
 * the preview is a wrap label, so the board matches the print; otherwise the
 * strips share the board evenly.
 */

export const PART_ICONS: Record<WrapPartKey, ReactNode> = {
  brand: <Tag size={16} />,
  legal: <FileText size={16} />,
  nutrition: <Leaf size={16} />,
  dates: <CalendarDays size={16} />,
  barcode: <Barcode size={16} />,
  qr: <QrCode size={16} />,
  marks: <Recycle size={16} />,
  text: <Type size={16} />,
  packed: <PackageOpen size={16} />,
};

/** The word on a strip, short enough for a narrow one. */
export const SHORT_NAMES: Record<WrapPartKey, string> = {
  brand: 'Brand', legal: 'Ingredients', nutrition: 'Nutrition', dates: 'Dates', barcode: 'Barcode', qr: 'QR', marks: 'Marks', text: 'Free text', packed: 'Packed for',
};

/** How many strips the thumbnails offer; "All" is every part the catalogue lists. */
export const STRIP_COUNTS = [2, 3, 4, 5, 6] as const;

/** The parts for a strip count: the ones kept, trimmed or filled from the usual order. */
export function partsForCount(parts: WrapPartKey[], count: number, catalogue: WrapCatalogue): WrapPartKey[] {
  if (count <= parts.length) return parts.slice(0, count);
  const pool = [...catalogue.default_parts, ...catalogue.parts.map((p) => p.key)].filter((k, i, all) => all.indexOf(k) === i);
  const next = [...parts];
  for (const key of pool) {
    if (next.length >= count) break;
    if (!next.includes(key)) next.push(key);
  }
  return next;
}

function CountThumb({ n, w = 44, h = 20 }: { n: number; w?: number; h?: number }) {
  const gap = 1.5;
  const sw = (w - 4 - gap * (n - 1)) / n;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={2} fill="var(--color-surface)" stroke="currentColor" strokeWidth={1} />
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={2 + i * (sw + gap)} y={3} width={sw} height={h - 9} rx={1} fill="currentColor" opacity={0.25} />
      ))}
      <rect x={2} y={h - 5} width={w - 4} height={2.4} rx={1} fill="var(--color-primary)" />
    </svg>
  );
}

type Props = {
  parts: WrapPartKey[];
  onChange: (parts: WrapPartKey[]) => void;
  catalogue: WrapCatalogue;
  /** Where the server put the strips, when the preview is a wrap label. */
  strips?: WrapStrips | null;
  /** The label's size, for the board's proportions; 180 × 40 until known. */
  w?: number;
  h?: number;
  /** Whether the flavour band is on, so the board shows it. */
  bandOn?: boolean;
  /** Puts the usual parts and marks back. */
  onReset?: () => void;
  /** The strip whose sheet is open, when the parent opens it (a tap on the preview). */
  openPart?: WrapPartKey | null;
  onOpenPart?: (part: WrapPartKey | null) => void;
  idPrefix?: string;
};

export function StripEditor({ parts, onChange, catalogue, strips, w = 180, h = 40, bandOn = true, onReset, openPart, onOpenPart, idPrefix = 'strips' }: Props) {
  const [ownOpen, setOwnOpen] = useState<WrapPartKey | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  // On a phone nine strips share 330 px: below about 56 px a strip shows its icon and number, its name in the sheet.
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(0);
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setBoardW(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = boardW > 0 && boardW / Math.max(1, parts.length) < 56;
  const open = openPart !== undefined ? openPart : ownOpen;
  const setOpen = (p: WrapPartKey | null) => { if (onOpenPart) onOpenPart(p); else setOwnOpen(p); };
  const wordsOf = (key: WrapPartKey) => catalogue.parts.find((p) => p.key === key) ?? { key, label: SHORT_NAMES[key] ?? key, hint: '' };
  const all = catalogue.parts.map((p) => p.key);

  // The board's strips: the server's widths when it drew these same parts, else even shares.
  const drawn = strips?.strips ?? [];
  const printed = drawn.map((s) => s.part);
  const leftOut = strips?.left_out ?? {};
  const totalW = drawn.reduce((sum, s) => sum + s.w, 0) || 1;
  const widthOf = (key: WrapPartKey): number => {
    const s = drawn.find((d) => d.part === key);
    if (!s || printed.length === 0) return 1 / Math.max(1, parts.length);
    return s.w / totalW;
  };
  const isOut = (key: WrapPartKey) => Boolean(strips) && !printed.includes(key);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= parts.length || from === to) return;
    const next = [...parts];
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    onChange(next);
  };
  const replace = (at: number, key: WrapPartKey) => {
    const next = [...parts];
    const was = next.indexOf(key);
    if (was >= 0 && was !== at) next[was] = next[at];
    next[at] = key;
    onChange(next);
    setOpen(key);
  };
  const remove = (key: WrapPartKey) => {
    if (parts.length <= 1) return;
    onChange(parts.filter((p) => p !== key));
    setOpen(null);
  };
  const add = () => {
    const next = partsForCount(parts, parts.length + 1, catalogue);
    onChange(next);
    const added = next[next.length - 1];
    if (added !== parts[parts.length - 1]) setOpen(added);
  };

  const onDragStart = (i: number) => (e: DragEvent) => { setDragging(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); };
  const onDrop = (i: number) => (e: DragEvent) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); setDragging(null); if (Number.isFinite(from)) move(from, i); };

  const openIndex = open ? parts.indexOf(open) : -1;
  const count = parts.length;

  return (
    <div className="space-y-3" data-testid="strip-editor">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="block text-xs font-semibold text-[var(--color-text-secondary)]">How many strips</span>
          {onReset && <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={onReset}>Reset</Button>}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How many strips">
          {STRIP_COUNTS.map((n) => (
            <button key={n} type="button" aria-pressed={count === n} onClick={() => onChange(partsForCount(parts, n, catalogue))}
              className={['h-9 min-h-[36px] px-2.5 rounded-lg border inline-flex items-center gap-2 text-sm font-semibold', count === n ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>
              <CountThumb n={n} /> {n}
            </button>
          ))}
          <button type="button" aria-pressed={count === all.length} onClick={() => onChange(partsForCount(parts, all.length, catalogue))}
            className={['h-9 min-h-[36px] px-2.5 rounded-lg border inline-flex items-center gap-2 text-sm font-semibold', count === all.length ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>
            <CountThumb n={all.length} w={56} /> All {all.length}
          </button>
        </div>
      </div>

      <div>
        <span className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">The strips, left to right. Tap one to change it; drag to reorder.</span>
        <div ref={boardRef} className="rounded-lg border border-[var(--color-text)] bg-white p-1 flex flex-col gap-1 w-full" style={{ aspectRatio: `${w} / ${h}`, minHeight: 72 }} data-testid="strip-board" role="group" aria-label="Strips" data-compact={compact ? 'true' : 'false'}>
          <div className="flex gap-1 flex-1 min-h-0">
            {parts.map((key, i) => {
              const words = wordsOf(key);
              const out = isOut(key);
              const why = leftOut[key];
              return (
                <button key={key} type="button" draggable onDragStart={onDragStart(i)} onDragOver={(e) => e.preventDefault()} onDrop={onDrop(i)} onDragEnd={() => setDragging(null)}
                  onClick={() => setOpen(key)} aria-label={`Strip ${i + 1}: ${words.label}${out ? why === 'empty' ? ' (nothing to print)' : ' (no room on this size)' : ''}`}
                  title={out ? (why === 'empty' ? 'Nothing to print in it yet' : 'No room on this size') : words.hint}
                  style={{ flex: `${widthOf(key)} 1 0` }}
                  className={['min-w-0 rounded-md border text-left px-1 py-1 flex flex-col items-center justify-center gap-0.5 overflow-hidden', open === key ? 'border-[var(--color-primary)] bg-[var(--color-tone-rust-bg)]' : out ? 'border-dashed border-[var(--color-border)] bg-[var(--color-bg)] opacity-60' : 'border-[var(--color-border)] bg-[var(--color-surface)]', dragging === i ? 'opacity-40' : ''].join(' ')}>
                  <span className="text-[var(--color-primary)]">{PART_ICONS[key]}</span>
                  <span className="text-[10px] font-semibold text-[var(--color-text)] leading-tight text-center truncate w-full">{compact ? i + 1 : (SHORT_NAMES[key] ?? words.label)}</span>
                </button>
              );
            })}
            {parts.length < all.length && (
              <button type="button" onClick={add} aria-label="Add a strip" className="w-9 shrink-0 rounded-md border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] inline-flex items-center justify-center"><Plus size={16} /></button>
            )}
          </div>
          {bandOn && <div className="h-2.5 rounded-sm bg-[var(--color-primary)] shrink-0" aria-hidden />}
        </div>
        {strips && Object.keys(leftOut).length > 0 && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1" data-testid="strip-left-out">
            Not printing: {Object.entries(leftOut).map(([k, why]) => `${wordsOf(k as WrapPartKey).label} (${why === 'empty' ? 'nothing to print in it' : 'no room on this size'})`).join(', ')}.
          </p>
        )}
      </div>

      {open && openIndex >= 0 && (
        <Modal title={`Strip ${openIndex + 1} of ${count}`} onClose={() => setOpen(null)} maxWidth={520}>
          <p className="text-xs text-[var(--color-text-muted)] mb-2">What this strip holds. A part used by another strip moves here.</p>
          <ul className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] overflow-hidden" role="radiogroup" aria-label="What the strip holds">
            {catalogue.parts.map((p) => {
              const on = p.key === open;
              const elsewhere = !on && parts.includes(p.key);
              return (
                <li key={p.key}>
                  <button type="button" role="radio" aria-checked={on} onClick={() => replace(openIndex, p.key)} className={['w-full text-left px-3 py-2 min-h-[44px] flex items-start gap-3', on ? 'bg-[var(--color-tone-rust-bg)]' : 'bg-[var(--color-surface)] hover:bg-[var(--color-bg)]'].join(' ')}>
                    <span className="mt-0.5 text-[var(--color-primary)]">{PART_ICONS[p.key]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[var(--color-text)]">{p.label}{elsewhere ? <span className="ml-2 text-[11px] font-normal text-[var(--color-text-muted)]">strip {parts.indexOf(p.key) + 1}</span> : null}</span>
                      {p.hint && <span className="block text-[11px] text-[var(--color-text-muted)]">{p.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ModalActions>
            <Btn variant="secondary" small onClick={() => move(openIndex, openIndex - 1)} disabled={openIndex === 0} aria-label="Move left"><ArrowLeft size={14} /> Left</Btn>
            <Btn variant="secondary" small onClick={() => move(openIndex, openIndex + 1)} disabled={openIndex === count - 1} aria-label="Move right">Right <ArrowRight size={14} /></Btn>
            <Btn variant="danger-outline" small onClick={() => remove(open)} disabled={count <= 1} aria-label="Remove this strip"><Trash2 size={14} /> Remove</Btn>
            <Btn onClick={() => setOpen(null)}>Done</Btn>
          </ModalActions>
        </Modal>
      )}
      <span id={`${idPrefix}-strips-note`} className="sr-only">Strips in order: {parts.map((k) => wordsOf(k).label).join(', ')}</span>
    </div>
  );
}

/** Touch zones over a wrap label's preview, one per strip the server drew; tapping one opens its sheet. */
export function StripOverlay({ strips, w, h, onPick, catalogue }: { strips: WrapStrips; w: number; h: number; onPick: (part: WrapPartKey) => void; catalogue: WrapCatalogue }) {
  const label = (key: WrapPartKey) => catalogue.parts.find((p) => p.key === key)?.label ?? key;
  return (
    <div className="absolute inset-0" data-testid="strip-overlay">
      {strips.strips.map((s) => (
        <button key={s.part} type="button" onClick={() => onPick(s.part)} aria-label={`Change the ${label(s.part)} strip`} title={label(s.part)}
          style={{ position: 'absolute', left: `${(s.x / w) * 100}%`, top: `${(s.y / h) * 100}%`, width: `${(s.w / w) * 100}%`, height: `${(s.h / h) * 100}%` }}
          className="rounded-sm border border-transparent hover:border-[var(--color-primary)] focus-visible:border-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] cursor-pointer" />
      ))}
    </div>
  );
}
