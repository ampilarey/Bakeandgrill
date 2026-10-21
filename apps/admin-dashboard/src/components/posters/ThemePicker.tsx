import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Monitor, Printer, Search } from 'lucide-react';
import { Btn, TabScrollRow } from '../SharedUI';
import { inputFont } from '../../utils/cssVars';
import type { PosterThemeCatalog, PosterThemeKind, PosterThemeSummary } from '../../api';

const KIND_WORDS: Record<PosterThemeKind, string> = { print: 'Print', screen: 'TV screens' };

/**
 * The first step of Make a poster (docs/POSTER_THEMES_HANDOFF.md § 5): the
 * ready-made designs by category, a style filter, a search box and a
 * thumbnail grid. Print designs (A2 to A5) and TV designs (Full HD, 4K and a
 * portrait screen) are two lists under one switch, since a design is drawn for
 * one or the other. "No template" keeps the classic purpose flow.
 */
export function ThemePicker({ catalog, onPick, onClassic, classic }: {
  catalog: PosterThemeCatalog | null;
  onPick: (theme: PosterThemeSummary) => void;
  onClassic: () => void;
  /** The classic flow is open below the picker. */
  classic: boolean;
}) {
  const [kind, setKind] = useState<PosterThemeKind>('print');
  const [category, setCategory] = useState<string>('all');
  const [style, setStyle] = useState<string>('all');
  const [q, setQ] = useState('');

  const names = useMemo(() => Object.fromEntries((catalog?.categories ?? []).map((c) => [c.key, c.name])), [catalog]);
  const kindOf = (t: PosterThemeSummary): PosterThemeKind => (t.kind === 'screen' ? 'screen' : 'print');
  const ofKind = useMemo(() => (catalog?.themes ?? []).filter((t) => kindOf(t) === kind), [catalog, kind]);
  // A server from before the TV designs sends no counts per kind: its categories are all print.
  const countOf = (c: PosterThemeCatalog['categories'][number]): number => (c.counts ? c.counts[kind] : (kind === 'print' ? c.count : 0));
  const categories = useMemo(() => (catalog?.categories ?? []).filter((c) => countOf(c) > 0), [catalog, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasScreens = (catalog?.themes ?? []).some((t) => kindOf(t) === 'screen');
  const query = q.trim().toLowerCase();
  const rows = useMemo(() => ofKind.filter((t) => {
    if (style !== 'all' && t.style !== style) return false;
    if (query !== '') {
      const hay = `${t.id} ${t.title} ${names[t.category] ?? ''} ${t.style_label}`.toLowerCase();
      return hay.includes(query);
    }
    return category === 'all' || t.category === category;
  }), [ofKind, category, style, query, names]);
  const styleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ofKind.forEach((t) => { counts[t.style] = (counts[t.style] ?? 0) + 1; });
    return counts;
  }, [ofKind]);
  // A category with nothing of this kind is not a tab; the list goes back to All.
  useEffect(() => {
    if (category !== 'all' && !categories.some((c) => c.key === category)) setCategory('all');
  }, [categories, category]);

  return (
    <section className="poster-picker" aria-label="Templates">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px', maxWidth: 360 }}>
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search templates"
            placeholder={kind === 'screen' ? 'Search TV templates (e.g. deals, hours, TV-027)' : 'Search templates (e.g. burger, Eid, BG-012)'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputFont(inputStyle)}
          />
        </label>
        <Btn variant={classic ? 'primary' : 'secondary'} onClick={onClassic} data-testid="poster-no-template">No template (classic layout)</Btn>
      </div>

      {catalog && hasScreens && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Made for">
          {(['print', 'screen'] as const).map((k) => (
            <Btn key={k} small variant={kind === k ? 'primary' : 'ghost'} aria-pressed={kind === k} data-testid={`poster-kind-${k}`} onClick={() => { setKind(k); setStyle('all'); }}>
              {k === 'print' ? <Printer size={14} aria-hidden="true" /> : <Monitor size={14} aria-hidden="true" />} {catalog.kinds?.[k] ?? KIND_WORDS[k]}
            </Btn>
          ))}
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {kind === 'screen' ? 'Drawn for a TV: Full HD, 4K or a portrait screen. Nothing to print.' : 'Printed on paper, A2 to A5.'}
          </span>
        </div>
      )}

      {catalog && ofKind.length > 0 && (
        <>
          <TabScrollRow role="tablist" aria-label="Template categories" style={{ gap: 6 }}>
            <Btn small variant={category === 'all' && query === '' ? 'primary' : 'ghost'} role="tab" aria-selected={category === 'all'} onClick={() => { setCategory('all'); setQ(''); }}>
              All · {ofKind.length}
            </Btn>
            {categories.map((c) => (
              <Btn key={c.key} small variant={category === c.key && query === '' ? 'primary' : 'ghost'} role="tab" aria-selected={category === c.key} title={c.description} onClick={() => { setCategory(c.key); setQ(''); }}>
                {c.name} · {countOf(c)}
              </Btn>
            ))}
          </TabScrollRow>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Style">
            <Chip on={style === 'all'} onClick={() => setStyle('all')}>All styles</Chip>
            {Object.entries(catalog.styles).filter(([key]) => (styleCounts[key] ?? 0) > 0).map(([key, label]) => (
              <Chip key={key} on={style === key} onClick={() => setStyle(key)}>{label} · {styleCounts[key] ?? 0}</Chip>
            ))}
          </div>
          {query !== '' && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Searching every category for “{q.trim()}”.</p>}
          {rows.length === 0
            ? <p style={{ color: 'var(--color-text-muted)' }}>No template matches. Try another word or style.</p>
            : (
              <div className={`poster-theme-grid${kind === 'screen' ? ' poster-theme-grid--screen' : ''}`} data-testid="poster-theme-grid">
                {rows.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`poster-theme-card${kindOf(t) === 'screen' ? ' poster-theme-card--screen' : ''}`}
                    style={t.aspect ? ({ '--aspect': `${t.aspect[0]} / ${t.aspect[1]}` } as CSSProperties) : undefined}
                    onClick={() => onPick(t)}
                    data-testid="poster-theme-card"
                    aria-label={`${t.id} ${t.title}`}
                  >
                    <img src={t.preview_url} alt="" loading="lazy" />
                    <span className="poster-theme-card__id">{t.id}</span>
                    <strong>{t.title}</strong>
                    <span className="poster-theme-card__meta">{t.style_label}{t.has_photo ? ` · ${t.photo_slots} photo${t.photo_slots > 1 ? 's' : ''}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
        </>
      )}
      {catalog && ofKind.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          {kind === 'screen' ? 'No TV templates are installed on this server.' : 'No templates are installed on this server.'}
        </p>
      )}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`poster-chip${on ? ' poster-chip--on' : ''}`}>
      {children}
    </button>
  );
}

const inputStyle: CSSProperties = {
  minHeight: 44, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text)', padding: '0 10px', fontSize: 15, width: '100%',
};
