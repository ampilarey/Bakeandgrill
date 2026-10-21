import { useState, type CSSProperties } from 'react';
import { ChevronDown, EyeOff, Eye, RotateCcw } from 'lucide-react';
import { Btn } from '../SharedUI';
import { inputFont } from '../../utils/cssVars';
import {
  isScreenTheme, slotPhoto, uploadPosterPhoto,
  type PosterDraft, type PosterPhotoPick, type PosterScreenSize, type PosterSheet, type PosterTheme, type PosterThemePhotoSlot, type PosterThemeTextSlot,
} from '../../api';

type Lookups = {
  items: { id: number; name: string; name_dv: string | null; price: { price: number; from: boolean } }[];
  promotions: { id: number; name: string; code: string | null; type: string; discount_value: number }[];
};

export const ROLE_LABELS: Record<string, string> = {
  eyebrow: 'Small line above',
  headline: 'Headline',
  headline_or_offer: 'Headline or offer',
  price_or_offer: 'Price or offer',
  detail: 'Detail',
  footer: 'Footer',
};

const SHAPE_WORDS: Record<string, string> = {
  circle: 'round', rect: 'rounded box', arch: 'arch', poly: 'diagonal band', pathd: 'wavy band',
};

export const SIZE_WORDS: Record<string, string> = {
  A2: 'wall poster', A3: 'wall poster', A4: 'counter card', A5: 'table card',
  TV: 'TV screen', TV4K: '4K TV screen', TVP: 'portrait TV screen',
};

/** The screen's short name on its button (PaperSize::SCREENS). */
export const SCREEN_WORDS: Record<string, string> = { TV: 'Full HD', TV4K: '4K', TVP: 'Portrait' };

/** What a variant is, in the size note and under the preview. */
export const VARIANT_WORDS: Record<string, string> = {
  large: 'wall design, bigger headline',
  small: 'counter design, bigger small print',
  tv: 'landscape TV design, drawn at the screen’s pixels',
  tvp: 'portrait TV design, drawn at the screen’s pixels',
};

/** The screens a TV design offers when the catalog sent none (an older server). */
const DEFAULT_SCREENS: PosterScreenSize[] = [
  { key: 'TV', label: 'TV · Full HD (1920 × 1080)', px: [1920, 1080], landscape: true },
  { key: 'TV4K', label: 'TV · 4K (3840 × 2160)', px: [3840, 2160], landscape: true },
  { key: 'TVP', label: 'TV · portrait (1080 × 1920)', px: [1080, 1920], landscape: false },
];

/**
 * The editor of a poster drawn on a template (docs/POSTER_THEMES_HANDOFF.md
 * § 5): the size (which picks the variant), a dish and an offer to bind, one
 * photo picker per photo slot and one input per text slot, the footer lines
 * folded. An input left empty prints the design's own words (or the live
 * price); Hide blanks the line. A TV design offers screens instead of paper:
 * Full HD and 4K draw the landscape variant, a portrait screen the portrait one.
 */
export function ThemedEditor({ draft, theme, lookups, sheet, sizes, screenSizes, onChange }: {
  draft: PosterDraft;
  theme: PosterTheme;
  lookups: Lookups | null;
  sheet: PosterSheet | null;
  /** The paper sizes, A5 to A2. */
  sizes: string[];
  /** The TV screens, with their pixels. */
  screenSizes?: PosterScreenSize[];
  onChange: (next: PosterDraft) => void;
}) {
  const screen = isScreenTheme(theme);
  const screens = screenSizes && screenSizes.length > 0 ? screenSizes : DEFAULT_SCREENS;
  const previewSize = draft.sizes[0] ?? (screen ? 'TV' : 'A4');
  const variantName = theme.size_to_variant[previewSize] ?? (screen ? 'tv' : 'small');
  const variant = theme.variants[variantName] ?? Object.values(theme.variants)[0];
  const pieces = sheet?.theme?.key === theme.key ? sheet.pieces : [];
  const setSlot = (id: string, value: PosterDraft['slots'][string]) => onChange({ ...draft, slots: { ...draft.slots, [id]: value } });
  const main = variant.text_slots.filter((s) => s.role_hint !== 'footer');
  const footer = variant.text_slots.filter((s) => s.role_hint === 'footer');
  const toggleSize = (s: string) => {
    const on = draft.sizes.includes(s);
    const next = on ? draft.sizes.filter((x) => x !== s) : [...draft.sizes, s];
    onChange({ ...draft, sizes: next.length > 0 ? next : [s] });
  };
  const px = screens.find((s) => s.key === previewSize)?.px;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="poster-themed-editor">
      <section style={sectionStyle}>
        <h3 style={h3Style}>{screen ? 'Screen' : 'Size'}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {screen
            ? screens.map((s) => {
              const on = draft.sizes.includes(s.key);
              return (
                <Btn key={s.key} small variant={on ? 'primary' : 'ghost'} aria-pressed={on} title={s.label} onClick={() => toggleSize(s.key)}>
                  {SCREEN_WORDS[s.key] ?? s.key} · {s.px[0]} × {s.px[1]}
                </Btn>
              );
            })
            : sizes.map((s) => {
              const on = draft.sizes.includes(s);
              return <Btn key={s} small variant={on ? 'primary' : 'ghost'} aria-pressed={on} onClick={() => toggleSize(s)}>{s}</Btn>;
            })}
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }} data-testid="poster-variant-note">
            Preview: {screen ? (SCREEN_WORDS[previewSize] ?? previewSize) : previewSize}, a {SIZE_WORDS[previewSize] ?? 'poster'}{px ? ` of ${px[0]} × ${px[1]} px` : ''} ({VARIANT_WORDS[variantName] ?? variantName}).
          </span>
        </div>
        {screen && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Full HD and 4K are the same design, the 4K picture drawn twice the size. Portrait is its own design for a screen on its side.
          </p>
        )}
      </section>

      {lookups && (
        <section style={sectionStyle}>
          <h3 style={h3Style}>From the menu</h3>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            <label style={labelStyle}>Dish (its photo and live price)
              <select style={inputFont(inputStyle)} value={draft.bindings.item_id ?? ''} onChange={(e) => onChange({ ...draft, bindings: { ...draft.bindings, item_id: e.target.value ? Number(e.target.value) : null } })}>
                <option value="">—</option>
                {lookups.items.map((i) => <option key={i.id} value={i.id}>{i.name} · MVR {i.price.price.toFixed(2)}{i.price.from ? ' from' : ''}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Offer (its percent and the QR)
              <select style={inputFont(inputStyle)} value={draft.bindings.promotion_id ?? ''} onChange={(e) => onChange({ ...draft, bindings: { ...draft.bindings, promotion_id: e.target.value ? Number(e.target.value) : null } })}>
                <option value="">—</option>
                {lookups.promotions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` · ${p.code}` : ''}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}

      {variant.photo_slots.length > 0 && (
        <section style={sectionStyle}>
          <h3 style={h3Style}>Photos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {variant.photo_slots.map((slot, i) => (
              <PhotoSlotField
                key={slot.id}
                index={i + 1}
                slot={slot}
                pick={slotPhoto(draft.slots, slot.id)}
                piece={pieces.find((p) => p.type === 'photo' && p.slot === slot.id) ?? null}
                items={lookups?.items ?? []}
                screen={screen}
                onChange={(pick) => setSlot(slot.id, pick)}
              />
            ))}
          </div>
        </section>
      )}

      <section style={sectionStyle}>
        <h3 style={h3Style}>Words and prices</h3>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Leave a box empty to keep the design’s words. A price box fills from the dish you picked.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {main.map((slot) => (
            <SlotInput key={slot.id} slot={slot} value={draft.slots[slot.id]} piece={pieces.find((p) => p.type === 'text' && p.slot === slot.id) ?? null} onChange={(v) => setSlot(slot.id, v)} />
          ))}
        </div>
        {footer.length > 0 && (
          <details className="cl-section" style={{ marginTop: 10 }} data-testid="poster-footer-fold">
            <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, minHeight: 32 }}>
              <ChevronDown size={16} className="cl-chev" aria-hidden="true" /> Footer lines ({footer.length})
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {footer.map((slot) => (
                <SlotInput key={slot.id} slot={slot} value={draft.slots[slot.id]} piece={pieces.find((p) => p.type === 'text' && p.slot === slot.id) ?? null} onChange={(v) => setSlot(slot.id, v)} />
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

function SlotInput({ slot, value, piece, onChange }: {
  slot: PosterThemeTextSlot;
  value: PosterDraft['slots'][string];
  piece: { text?: string; auto?: boolean; pt?: number } | null;
  onChange: (value: string | false | null) => void;
}) {
  const hidden = value === false;
  const typed = typeof value === 'string' && value !== '';
  const label = ROLE_LABELS[slot.role_hint] ?? slot.role_hint;
  const placeholder = hidden ? 'Hidden' : (piece?.text ?? slot.default);
  const id = `poster-slot-${slot.id}`;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
      <label htmlFor={id} style={{ ...labelStyle, flex: 1 }}>
        <span>{label}{piece?.auto ? <em style={{ color: 'var(--color-text-muted)', fontStyle: 'normal' }}> · from the menu</em> : null}</span>
        <input
          id={id}
          style={inputFont({ ...inputStyle, opacity: hidden ? 0.5 : 1 })}
          value={typeof value === 'string' ? value : ''}
          placeholder={placeholder}
          disabled={hidden}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      </label>
      {typed && (
        <Btn small variant="ghost" title="Back to the design’s words" aria-label={`Reset ${label}`} onClick={() => onChange(null)}><RotateCcw size={14} /></Btn>
      )}
      <Btn small variant="ghost" title={hidden ? 'Show this line' : 'Hide this line'} aria-label={`${hidden ? 'Show' : 'Hide'} ${label}`} aria-pressed={hidden} onClick={() => onChange(hidden ? null : false)}>
        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
      </Btn>
    </div>
  );
}

function PhotoSlotField({ index, slot, pick, piece, items, screen = false, onChange }: {
  index: number;
  slot: PosterThemePhotoSlot;
  pick: PosterPhotoPick | null;
  piece: { src?: string | null; source?: string } | null;
  items: Lookups['items'];
  /** The design is for a TV: a small photo looks soft on the screen rather than in print. */
  screen?: boolean;
  onChange: (pick: PosterPhotoPick | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const itemId = pick?.item_id ?? '';
  const use = pick?.use ?? 'main';
  const source = piece?.source ?? 'placeholder';
  const words = {
    upload: 'Your uploaded photo.',
    master: 'The dish’s full-size photo.',
    crop: screen ? 'Only the dish’s small website photo: upload a sharper one so it is not soft on the screen.' : 'Only the dish’s small website photo: upload a sharper one for print.',
    cutout: 'The dish’s cut-out on the design’s colour.',
    placeholder: pick?.item_id ? 'That dish has no photo yet; the design’s picture stands in.' : 'The design’s own picture. Pick a dish or upload a photo.',
  }[source] ?? '';
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'start', padding: 10, border: '1px solid var(--color-border-light)', borderRadius: 10 }} data-testid={`poster-photo-${slot.id}`}>
      <div style={{ width: 64, height: 64, borderRadius: slot.shape === 'circle' ? '50%' : 8, overflow: 'hidden', background: slot.fill_behind, display: 'grid', placeItems: 'center' }}>
        {piece?.src ? <img src={piece.src} alt="" style={{ width: '100%', height: '100%', objectFit: source === 'cutout' ? 'contain' : 'cover' }} /> : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong style={{ fontSize: 14 }}>Photo {index} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· {SHAPE_WORDS[slot.shape] ?? slot.shape}</span></strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label={`Dish for photo ${index}`} style={inputFont({ ...inputStyle, minWidth: 160, flex: '1 1 160px' })} value={itemId} onChange={(e) => onChange(e.target.value ? { item_id: Number(e.target.value), use } : null)}>
            <option value="">Pick a dish…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          {itemId !== '' && slot.cutout_ok && (
            <div style={{ display: 'flex', gap: 4 }} role="group" aria-label={`Photo ${index} style`}>
              <Btn small variant={use === 'main' ? 'primary' : 'ghost'} aria-pressed={use === 'main'} onClick={() => onChange({ item_id: Number(itemId), use: 'main' })}>Photo</Btn>
              <Btn small variant={use === 'cutout' ? 'primary' : 'ghost'} aria-pressed={use === 'cutout'} onClick={() => onChange({ item_id: Number(itemId), use: 'cutout' })}>Cut-out</Btn>
            </div>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <span className="poster-upload-btn">{busy ? 'Uploading…' : 'Upload'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload a photo for photo ${index}`} disabled={busy} style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true); setError('');
              try { onChange({ photo_path: (await uploadPosterPhoto(file)).photo_path }); } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); } finally { setBusy(false); }
            }} />
          </label>
          {pick && <Btn small variant="ghost" onClick={() => onChange(null)}>Design’s picture</Btn>}
        </div>
        <span style={{ fontSize: 12, color: source === 'crop' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{words}</span>
        {error && <span role="alert" style={{ fontSize: 13, color: 'var(--color-danger)' }}>{error}</span>}
      </div>
    </div>
  );
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const h3Style: CSSProperties = { margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', fontWeight: 600 };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--color-text-secondary)' };
const inputStyle: CSSProperties = {
  minHeight: 44, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text)', padding: '0 10px', fontSize: 15,
};
