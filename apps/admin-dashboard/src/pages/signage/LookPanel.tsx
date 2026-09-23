/**
 * "Look" for a screen or a group: which layout preset the generated menu
 * uses, the knobs on it, which categories it shows, and the theme colours.
 *
 * Owner, 2026-09-23: "setting different layout for the tv in admin app".
 * A screen's look sits on its group's, which sits on the playlist's own
 * auto-menu settings; "Playlist's own" clears the look at this level.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  LAYOUT_PRESETS,
  LAYOUT_PRESET_KEYS,
  isLayoutPreset,
  resolveLayout,
  type SignageLayoutPreset,
} from '@shared/signage';
import type { MenuCategory, SignageLayoutBag } from '../../api';
import { Btn } from '../../components/SharedUI';

export type LookTheme = {
  primary?: string;
  background?: string;
  text?: string;
  muted?: string;
  font_display?: string;
  font_body?: string;
};

export type LookSave = { layout: SignageLayoutBag | null; theme: LookTheme | null };

type Props = {
  kind: 'screen' | 'group';
  layout: SignageLayoutBag | null | undefined;
  theme: LookTheme | null | undefined;
  /** The group's look, for a screen — shown as what "Playlist's own" falls back to. */
  inherited?: SignageLayoutBag | null;
  inheritedLabel?: string;
  categories: MenuCategory[];
  saving: boolean;
  onSave: (next: LookSave) => void | Promise<void>;
  testId?: string;
};

const FONT_CHOICES: Array<{ value: string; label: string; display: string; body: string }> = [
  { value: 'brand', label: 'Brand (Plus Jakarta Sans)', display: '', body: '' },
  { value: 'serif', label: 'Serif headings', display: 'Georgia, serif', body: '' },
  { value: 'system', label: 'System font', display: 'system-ui, sans-serif', body: 'system-ui, sans-serif' },
];

const DEFAULT_THEME: Required<Pick<LookTheme, 'primary' | 'background' | 'text' | 'muted'>> = {
  primary: '#D4813A',
  background: '#1C1408',
  text: '#FFF8F0',
  muted: '#C4B5A5',
};

const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' };
const field: CSSProperties = { minHeight: 44, width: '100%', borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--color-surface)', color: 'var(--color-text)' };

function fontChoice(theme: LookTheme | null | undefined): string {
  const d = theme?.font_display ?? '';
  const b = theme?.font_body ?? '';
  const hit = FONT_CHOICES.find((f) => f.display === d && f.body === b);
  return hit?.value ?? 'brand';
}

function hexOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** A 64×36 sketch of the preset — lines for rows, blocks for photos. */
function PresetSketch({ preset }: { preset: SignageLayoutPreset }) {
  const line = (w: string): CSSProperties => ({ height: 2, width: w, background: 'currentColor', opacity: 0.55, borderRadius: 1 });
  const block = (w: string, h: string): CSSProperties => ({ width: w, height: h, background: 'currentColor', opacity: 0.85, borderRadius: 2 });
  const box: CSSProperties = { width: 64, height: 36, display: 'flex', gap: 3, padding: 4, boxSizing: 'border-box', background: '#1C1408', color: '#D4813A', borderRadius: 6 };
  switch (preset) {
    case 'photo_grid':
      return (
        <div style={{ ...box, flexWrap: 'wrap', alignContent: 'flex-start' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={block('16px', '12px')} />)}
        </div>
      );
    case 'magazine':
      return (
        <div style={box}>
          <div style={block('22px', '100%')} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
            {[0, 1, 2, 3].map((i) => <div key={i} style={line('100%')} />)}
          </div>
        </div>
      );
    case 'price_board':
      return (
        <div style={box}>
          {[0, 1, 2].map((c) => (
            <div key={c} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={line('100%')} />)}
            </div>
          ))}
        </div>
      );
    case 'portrait':
      return (
        <div style={{ ...box, width: 36, height: 48, flexDirection: 'column', justifyContent: 'center' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <div style={block('6px', '6px')} />
              <div style={{ ...line('100%'), flex: 1 }} />
            </div>
          ))}
        </div>
      );
    default:
      return (
        <div style={box}>
          {[0, 1].map((c) => (
            <div key={c} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <div style={block('5px', '5px')} />
                  <div style={{ ...line('100%'), flex: 1 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
  }
}

export function LookPanel({ kind, layout, theme, inherited, inheritedLabel, categories, saving, onSave, testId = 'signage-look' }: Props) {
  const [open, setOpen] = useState(Boolean(layout?.preset) || Boolean(theme && Object.keys(theme).length));
  // null preset = "Playlist's own" — no look at this level.
  const [preset, setPreset] = useState<SignageLayoutPreset | null>(isLayoutPreset(layout?.preset) ? layout.preset : null);
  const [draft, setDraft] = useState<SignageLayoutBag>(layout ?? {});
  const [colors, setColors] = useState({ ...DEFAULT_THEME, ...Object.fromEntries(Object.entries(theme ?? {}).filter(([k, v]) => k in DEFAULT_THEME && typeof v === 'string')) });
  const [font, setFont] = useState(fontChoice(theme));
  const [themeOn, setThemeOn] = useState(Boolean(theme && Object.keys(theme).length));

  useEffect(() => {
    setPreset(isLayoutPreset(layout?.preset) ? layout.preset : null);
    setDraft(layout ?? {});
  }, [layout]);

  // What the TV will actually use with the current draft.
  const effective = useMemo(
    () => resolveLayout(inherited, preset ? { ...draft, preset } : null),
    [inherited, draft, preset],
  );

  const choosePreset = (p: SignageLayoutPreset) => {
    setPreset(p);
    // A fresh preset starts from its own defaults — the knobs below show them.
    setDraft({ preset: p, category_ids: draft.category_ids ?? [], dhivehi_first: draft.dhivehi_first ?? false });
  };

  const patch = (next: Partial<SignageLayoutBag>) => setDraft((d) => ({ ...d, ...next }));

  const topLevel = categories.filter((c) => c.parent_id == null);
  const childrenOf = (id: number) => categories.filter((c) => c.parent_id === id);
  const chosen = new Set(draft.category_ids ?? []);
  const toggleCategory = (id: number) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    patch({ category_ids: Array.from(next) });
  };

  const save = () => {
    const nextLayout: SignageLayoutBag | null = preset
      ? {
        preset,
        columns: effective.columns,
        rows_per_slide: effective.rows_per_slide,
        show_thumbs: effective.show_thumbs,
        showcase_cap: effective.showcase_cap,
        card_style: effective.card_style,
        category_ids: draft.category_ids ?? [],
        dhivehi_first: draft.dhivehi_first ?? false,
      }
      : null;
    const fontPick = FONT_CHOICES.find((f) => f.value === font) ?? FONT_CHOICES[0];
    const nextTheme: LookTheme | null = themeOn
      ? { ...colors, font_display: fontPick.display, font_body: fontPick.body }
      : null;
    void onSave({ layout: nextLayout, theme: nextTheme });
  };

  const inheritsFrom = inherited?.preset && isLayoutPreset(inherited.preset)
    ? `${LAYOUT_PRESETS[inherited.preset].label}${inheritedLabel ? ` (from ${inheritedLabel})` : ''}`
    : 'the playlist\'s own settings';

  return (
    <div data-testid={testId} style={{ marginTop: 14, borderTop: '1px solid var(--color-border-light)', paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`${testId}-toggle`}
        style={{ background: 'none', border: 0, padding: 0, minHeight: 44, cursor: 'pointer', fontWeight: 700, color: 'var(--color-text)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Look &amp; theme
        <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text-muted)' }}>
          {preset ? LAYOUT_PRESETS[preset].label : `Playlist's own · falls back to ${inheritsFrom}`}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={label}>Layout</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              data-testid={`${testId}-preset-own`}
              onClick={() => { setPreset(null); setDraft({}); }}
              aria-pressed={preset === null}
              style={{ ...presetBtn(preset === null), minWidth: 120 }}
            >
              <strong style={{ fontSize: 13 }}>Playlist's own</strong>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>No look at this {kind}</span>
            </button>
            {LAYOUT_PRESET_KEYS.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`${testId}-preset-${p}`}
                onClick={() => choosePreset(p)}
                aria-pressed={preset === p}
                title={LAYOUT_PRESETS[p].blurb}
                style={presetBtn(preset === p)}
              >
                <PresetSketch preset={p} />
                <strong style={{ fontSize: 13 }}>{LAYOUT_PRESETS[p].label}</strong>
              </button>
            ))}
          </div>
          {preset && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{LAYOUT_PRESETS[preset].blurb}</p>
          )}

          {preset && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
              <div>
                <label style={label}>Columns</label>
                <select data-testid={`${testId}-columns`} style={field} value={String(effective.columns)} onChange={(e) => patch({ columns: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Rows per slide</label>
                <input data-testid={`${testId}-rows`} type="number" min={1} max={40} style={field} value={effective.rows_per_slide} onChange={(e) => patch({ rows_per_slide: Number(e.target.value) || 1 })} />
              </div>
              <div>
                <label style={label}>Showcases per loop</label>
                <input data-testid={`${testId}-cap`} type="number" min={0} max={30} style={field} value={effective.showcase_cap} onChange={(e) => patch({ showcase_cap: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <label style={label}>Showcase card</label>
                <select data-testid={`${testId}-card`} style={field} value={effective.card_style} onChange={(e) => patch({ card_style: e.target.value === 'stack' ? 'stack' : 'split' })}>
                  <option value="split">Photo beside the words</option>
                  <option value="stack">Words under a round photo</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                <input data-testid={`${testId}-thumbs`} type="checkbox" checked={effective.show_thumbs} onChange={(e) => patch({ show_thumbs: e.target.checked })} />
                <span style={{ fontSize: 13 }}>Photos beside rows</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                <input data-testid={`${testId}-dv-first`} type="checkbox" checked={Boolean(draft.dhivehi_first)} onChange={(e) => patch({ dhivehi_first: e.target.checked })} />
                <span style={{ fontSize: 13 }}>Dhivehi first</span>
              </label>
            </div>
          )}

          {preset && categories.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <label style={label}>Categories on this {kind} {chosen.size === 0 ? '— all of the menu' : `— ${chosen.size} chosen`}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topLevel.map((parent) => (
                  <div key={parent.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <button type="button" data-testid={`${testId}-cat-${parent.id}`} aria-pressed={chosen.has(parent.id)} onClick={() => toggleCategory(parent.id)} style={chip(chosen.has(parent.id), true)}>
                      {parent.name}
                    </button>
                    {childrenOf(parent.id).map((c) => (
                      <button key={c.id} type="button" data-testid={`${testId}-cat-${c.id}`} aria-pressed={chosen.has(c.id)} onClick={() => toggleCategory(c.id)} style={chip(chosen.has(c.id), false)}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
              <input data-testid={`${testId}-theme-on`} type="checkbox" checked={themeOn} onChange={(e) => setThemeOn(e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Own colours and fonts on this {kind}</span>
            </label>
            {themeOn && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 8 }}>
                {(['primary', 'background', 'text', 'muted'] as const).map((k) => (
                  <div key={k}>
                    <label style={label}>{k === 'primary' ? 'Accent' : k[0].toUpperCase() + k.slice(1)}</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        aria-label={`${k} colour`}
                        data-testid={`${testId}-color-${k}`}
                        value={hexOr(colors[k], DEFAULT_THEME[k])}
                        onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))}
                        style={{ width: 44, height: 44, padding: 2, border: '1px solid var(--color-border)', borderRadius: 10, background: 'transparent' }}
                      />
                      <input style={{ ...field, minHeight: 40 }} value={colors[k]} onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))} />
                    </div>
                  </div>
                ))}
                <div>
                  <label style={label}>Fonts</label>
                  <select data-testid={`${testId}-font`} style={field} value={font} onChange={(e) => setFont(e.target.value)}>
                    {FONT_CHOICES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Btn onClick={save} disabled={saving} style={{ minHeight: 44 }} data-testid={`${testId}-save`}>
              {saving ? 'Saving…' : 'Save look'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function presetBtn(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    minHeight: 44,
    borderRadius: 12,
    cursor: 'pointer',
    background: active ? 'var(--color-primary-bg, rgba(212,129,58,0.12))' : 'var(--color-surface)',
    border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
  };
}

function chip(active: boolean, parent: boolean): CSSProperties {
  return {
    minHeight: 36,
    padding: '0 12px',
    borderRadius: 999,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: parent ? 700 : 500,
    background: active ? 'var(--color-primary)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-text)',
    border: active ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
  };
}
