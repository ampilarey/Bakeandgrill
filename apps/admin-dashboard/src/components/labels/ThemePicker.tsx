import { Check } from 'lucide-react';
import type { LabelThemeChoice } from '../../api';

/*
 * The label's colours, in one tap (owner, 2026-11-27: "add more nice themes to each template and custom labels
 * also"). A theme changes the headings, panels, date boxes and border of whatever label it is on; the words,
 * the picture and the layout stay, and the barcode and QR codes stay black on white. The list comes from the
 * server (LabelTheme::THEMES, `themes` on the layouts); this copy stands in until it has loaded.
 */
export const THEME_FALLBACK: LabelThemeChoice[] = [
  { key: 'rust', name: 'Rust', accent: '#B74B0C', tint: '#FEF3E8', dark: '#1C1408' },
  { key: 'forest', name: 'Forest', accent: '#1F6B3A', tint: '#EDF6EE', dark: '#0F2416' },
  { key: 'ocean', name: 'Ocean', accent: '#0F5E8C', tint: '#E9F3F9', dark: '#0A1E2C' },
  { key: 'teal', name: 'Lagoon', accent: '#0E6F6B', tint: '#E6F4F3', dark: '#082523' },
  { key: 'gold', name: 'Gold', accent: '#8A6400', tint: '#FBF3DC', dark: '#241A05' },
  { key: 'chilli', name: 'Chilli', accent: '#B3261E', tint: '#FDECEA', dark: '#2B0B09' },
  { key: 'berry', name: 'Berry', accent: '#8E1F3F', tint: '#FBECEF', dark: '#2A0B14' },
  { key: 'plum', name: 'Plum', accent: '#5B3A8C', tint: '#F1ECF8', dark: '#1B1230' },
  { key: 'cocoa', name: 'Cocoa', accent: '#6B4226', tint: '#F6EEE7', dark: '#22140A' },
  { key: 'charcoal', name: 'Charcoal', accent: '#333333', tint: '#F1F1F1', dark: '#111111' },
  { key: 'mono', name: 'Black and white', accent: '#000000', tint: '#FFFFFF', dark: '#000000' },
];

export function ThemePicker({ value, onChange, themes, pouch = false }: {
  value: string;
  onChange: (key: string) => void;
  themes?: LabelThemeChoice[];
  /** A pouch label takes its colours from the pouch's own look, so the themes do not apply to it. */
  pouch?: boolean;
}) {
  const list = themes && themes.length > 0 ? themes : THEME_FALLBACK;
  const picked = list.some((t) => t.key === value) ? value : 'rust';
  if (pouch) {
    return <p className="text-xs text-[var(--color-text-muted)]" data-testid="label-theme-pouch">A pouch label takes its colours from the pouch colour picked below.</p>;
  }
  return (
    <div data-testid="label-theme">
      <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1">Colours</div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Label colours">
        {list.map((t) => {
          const on = picked === t.key;
          return (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => onChange(t.key)} data-testid={`label-theme-${t.key}`}
              className={['h-8 pl-1.5 pr-3 rounded-full border text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5', on ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>
              {/* The theme's own colours, as paper: a swatch is the one place these are not the admin's tokens. */}
              <span aria-hidden className="w-5 h-5 rounded-full border border-[var(--color-border)] inline-flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${t.accent} 0 50%, ${t.tint} 50% 100%)` }}>
                {on ? <Check size={11} color="#fff" strokeWidth={3} /> : null}
              </span>
              {t.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">Changes the headings, panels, date boxes and border. Words stay black, and the barcode and QR codes stay black on white.</p>
    </div>
  );
}
