import { useMemo, useState, type CSSProperties } from 'react';
import { Search } from 'lucide-react';
import { Btn, TabScrollRow } from '../SharedUI';
import { inputFont } from '../../utils/cssVars';
import type { PosterThemeCatalog, PosterThemeSummary } from '../../api';

/**
 * The first step of Make a poster (docs/POSTER_THEMES_HANDOFF.md § 5): the
 * 110 ready-made designs by category, a style filter, a search box and a
 * thumbnail grid. "No template" keeps the classic purpose flow.
 */
export function ThemePicker({ catalog, onPick, onClassic, classic }: {
  catalog: PosterThemeCatalog | null;
  onPick: (theme: PosterThemeSummary) => void;
  onClassic: () => void;
  /** The classic flow is open below the picker. */
  classic: boolean;
}) {
  const [category, setCategory] = useState<string>('all');
  const [style, setStyle] = useState<string>('all');
  const [q, setQ] = useState('');

  const names = useMemo(() => Object.fromEntries((catalog?.categories ?? []).map((c) => [c.key, c.name])), [catalog]);
  const query = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = catalog?.themes ?? [];
    return all.filter((t) => {
      if (style !== 'all' && t.style !== style) return false;
      if (query !== '') {
        const hay = `${t.id} ${t.title} ${names[t.category] ?? ''} ${t.style_label}`.toLowerCase();
        return hay.includes(query);
      }
      return category === 'all' || t.category === category;
    });
  }, [catalog, category, style, query, names]);
  const styleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (catalog?.themes ?? []).forEach((t) => { counts[t.style] = (counts[t.style] ?? 0) + 1; });
    return counts;
  }, [catalog]);

  return (
    <section className="poster-picker" aria-label="Templates">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px', maxWidth: 360 }}>
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search templates"
            placeholder="Search templates (e.g. burger, Eid, BG-012)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={inputFont(inputStyle)}
          />
        </label>
        <Btn variant={classic ? 'primary' : 'secondary'} onClick={onClassic} data-testid="poster-no-template">No template (classic layout)</Btn>
      </div>

      {catalog && catalog.themes.length > 0 && (
        <>
          <TabScrollRow role="tablist" aria-label="Template categories" style={{ gap: 6 }}>
            <Btn small variant={category === 'all' && query === '' ? 'primary' : 'ghost'} role="tab" aria-selected={category === 'all'} onClick={() => { setCategory('all'); setQ(''); }}>
              All · {catalog.themes.length}
            </Btn>
            {catalog.categories.map((c) => (
              <Btn key={c.key} small variant={category === c.key && query === '' ? 'primary' : 'ghost'} role="tab" aria-selected={category === c.key} title={c.description} onClick={() => { setCategory(c.key); setQ(''); }}>
                {c.name} · {c.count}
              </Btn>
            ))}
          </TabScrollRow>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Style">
            <Chip on={style === 'all'} onClick={() => setStyle('all')}>All styles</Chip>
            {Object.entries(catalog.styles).map(([key, label]) => (
              <Chip key={key} on={style === key} onClick={() => setStyle(key)}>{label} · {styleCounts[key] ?? 0}</Chip>
            ))}
          </div>
          {query !== '' && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Searching every category for “{q.trim()}”.</p>}
          {rows.length === 0
            ? <p style={{ color: 'var(--color-text-muted)' }}>No template matches. Try another word or style.</p>
            : (
              <div className="poster-theme-grid" data-testid="poster-theme-grid">
                {rows.map((t) => (
                  <button key={t.key} type="button" className="poster-theme-card" onClick={() => onPick(t)} data-testid="poster-theme-card" aria-label={`${t.id} ${t.title}`}>
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
      {catalog && catalog.themes.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No templates are installed on this server.</p>}
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
