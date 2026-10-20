import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Btn, Input, Select, Switch } from '../../components/SharedUI';
import { MediaPicker } from '../../components/MediaPicker';
import type { CardSettings } from '../../api/cards';
import { CARD_ACCENTS, CARD_SIZES, CARD_TEMPLATES, localPath } from './cardSpec';
import { inputFont } from '../../utils/cssVars';

type Props = { value: CardSettings; onChange: (next: CardSettings) => void };

const fold: React.CSSProperties = { border: '1px solid var(--color-border-light)', borderRadius: 12, padding: '10px 12px', background: 'var(--color-surface)' };
const sum: React.CSSProperties = { cursor: 'pointer', fontWeight: 700, fontSize: 14 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10, marginTop: 10 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 14, padding: '4px 0' };

function TextArea({ label, value, onChange, dir }: { label: string; value: string; onChange: (v: string) => void; dir?: 'rtl' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}>
      {label}
      <textarea
        value={value}
        dir={dir}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        style={inputFont({ fontSize: 16, padding: 10, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontFamily: 'inherit', resize: 'vertical' })}
      />
    </label>
  );
}

/** Everything a card design holds, in folds: Look, Words, Back, Shows. */
export function CardDesignForm({ value: v, onChange }: Props) {
  const [picking, setPicking] = useState(false);
  const set = <K extends keyof CardSettings>(k: K, val: CardSettings[K]) => onChange({ ...v, [k]: val });
  const dv = v.lang !== 'en';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="card-design-form">
      <details open style={fold}>
        <summary style={sum}>Look</summary>
        <div role="radiogroup" aria-label="Design" style={{ ...grid, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
          {CARD_TEMPLATES.map((t) => {
            const on = v.template === t.value;
            return (
              <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => set('template', t.value)}
                style={{ textAlign: 'start', padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text)',
                  border: `1.5px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`, background: on ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)' }}>
                <strong style={{ display: 'block', fontSize: 14 }}>{t.label}</strong>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.hint}</span>
              </button>
            );
          })}
        </div>
        <div style={grid}>
          <Select label="Card size" value={v.size} onChange={(s) => {
            const p = CARD_SIZES.find((x) => x.value === s);
            onChange({ ...v, size: s, ...(p && s !== 'custom' ? { w: p.w, h: p.h } : {}) });
          }} options={CARD_SIZES.map((s) => ({ value: s.value, label: s.label }))} />
          <Select label="Turned" value={v.orientation} onChange={(o) => set('orientation', o as CardSettings['orientation'])}
            options={[{ value: 'landscape', label: 'Landscape (wide)' }, { value: 'portrait', label: 'Portrait (tall)' }]} />
          {v.size === 'custom' && (
            <>
              <Input label="Width (mm)" type="number" inputMode="decimal" value={String(v.w)} onChange={(x) => set('w', Number(x) || v.w)} />
              <Input label="Height (mm)" type="number" inputMode="decimal" value={String(v.h)} onChange={(x) => set('h', Number(x) || v.h)} />
            </>
          )}
          <Select label="Language" value={v.lang} onChange={(l) => set('lang', l as CardSettings['lang'])}
            options={[{ value: 'en', label: 'English' }, { value: 'dv', label: 'Dhivehi' }, { value: 'both', label: 'English and Dhivehi' }]} />
        </div>
        {v.template !== 'photo' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6 }}>Colour</div>
            <div role="radiogroup" aria-label="Colour" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CARD_ACCENTS.map((a) => (
                <button key={a.value} type="button" role="radio" aria-checked={v.accent === a.value} onClick={() => set('accent', a.value)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'var(--color-text)',
                    border: `1.5px solid ${v.accent === a.value ? 'var(--color-primary)' : 'var(--color-border)'}`, background: v.accent === a.value ? 'var(--color-tone-rust-bg)' : 'var(--color-surface)' }}>
                  <span aria-hidden style={{ width: 14, height: 14, borderRadius: 7, background: a.swatch, border: '1px solid var(--color-border)' }} />{a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {v.template === 'photo' && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn small variant="secondary" onClick={() => setPicking(true)}><ImagePlus size={14} aria-hidden />{v.photo ? 'Change photo' : 'Pick a photo'}</Btn>
              {v.photo && <Btn small variant="ghost" onClick={() => set('photo', '')}><X size={14} aria-hidden />Remove</Btn>}
              {v.photo && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{v.photo.split('/').pop()}</span>}
            </div>
            <label style={{ fontSize: 13 }}>
              Darken the photo: {v.photo_dim}%
              <input type="range" min={0} max={85} value={v.photo_dim} onChange={(e) => set('photo_dim', Number(e.target.value))} style={{ width: '100%' }} />
            </label>
            <MediaPicker open={picking} onClose={() => setPicking(false)} mediaType="image" title="Card photo"
              onPick={(a) => { set('photo', localPath(a.url)); setPicking(false); }} />
          </div>
        )}
      </details>

      <details open style={fold}>
        <summary style={sum}>Words on the front</summary>
        <div style={grid}>
          <Input label="Title (small, top)" value={v.title} maxLength={40} onChange={(x) => set('title', x)} />
          {dv && <Input label="Title in Dhivehi" dir="rtl" value={v.title_dv} maxLength={40} onChange={(x) => set('title_dv', x)} />}
          <Input label="Big line (blank: the card's value, e.g. 20% OFF)" value={v.headline} maxLength={30} onChange={(x) => set('headline', x)} />
          {dv && <Input label="Big line in Dhivehi" dir="rtl" value={v.headline_dv} maxLength={30} onChange={(x) => set('headline_dv', x)} />}
          <Input label="Small note" value={v.note} maxLength={90} onChange={(x) => set('note', x)} />
          {dv && <Input label="Small note in Dhivehi" dir="rtl" value={v.note_dv} maxLength={90} onChange={(x) => set('note_dv', x)} />}
        </div>
      </details>

      <details style={fold}>
        <summary style={sum}>Back of the card</summary>
        <div style={row}><span>Print a back</span><Switch checked={v.back} onChange={(b) => set('back', b)} aria-label="Print a back" /></div>
        {v.back && (
          <div style={grid}>
            <Input label="Heading" value={v.back_title} maxLength={50} onChange={(x) => set('back_title', x)} />
            {dv && <Input label="Heading in Dhivehi" dir="rtl" value={v.back_title_dv} maxLength={50} onChange={(x) => set('back_title_dv', x)} />}
            {v.template === 'stamp' ? (
              <>
                <Input label="Stamps (4 to 12)" type="number" inputMode="numeric" value={String(v.stamps)} onChange={(x) => set('stamps', Math.max(4, Math.min(12, Number(x) || 10)))} />
                <Input label="Under the stamps" value={v.stamp_reward} maxLength={50} onChange={(x) => set('stamp_reward', x)} />
                {dv && <Input label="Under the stamps in Dhivehi" dir="rtl" value={v.stamp_reward_dv} maxLength={50} onChange={(x) => set('stamp_reward_dv', x)} />}
              </>
            ) : (
              <>
                <TextArea label="Terms (up to 4 lines)" value={v.back_text} onChange={(x) => set('back_text', x)} />
                {dv && <TextArea label="Terms in Dhivehi" dir="rtl" value={v.back_text_dv} onChange={(x) => set('back_text_dv', x)} />}
              </>
            )}
          </div>
        )}
        {v.back && <div style={row}><span>Phone, website and address along the bottom</span><Switch checked={v.back_contact} onChange={(b) => set('back_contact', b)} aria-label="Contact line" /></div>}
      </details>

      <details style={fold}>
        <summary style={sum}>What the card shows</summary>
        {([
          ['show_logo', 'Logo'],
          ['show_qr', 'QR code (opens the order app with the code filled in)'],
          ['show_code', 'The code in letters'],
          ['show_expiry', 'Valid until'],
          ['show_number', 'Card number (No. 12 of 200)'],
        ] as [keyof CardSettings, string][]).map(([k, label]) => (
          <div key={k} style={row}><span>{label}</span><Switch checked={Boolean(v[k])} onChange={(b) => set(k, b as never)} aria-label={label} /></div>
        ))}
      </details>
    </div>
  );
}
