/**
 * A colour control that is actually a colour control.
 *
 * Owner, 2026-08-17: "its color is limited … can't select font color … more
 * color options for background." Colour used to be a six-token palette with a
 * bare hex TEXT box hidden behind an "Advanced" toggle, so picking a colour
 * meant knowing hex by heart. This pairs the native picker with the hex field
 * and a row of quick swatches, and every colour setting on a slide uses it.
 */
import type { CSSProperties } from 'react';

/** Restaurant palette first, then neutrals — the colours actually used here. */
export const HERO_QUICK_COLORS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#1c1408', label: 'Dark' },
  { hex: '#2d1a0a', label: 'Brand dark' },
  { hex: '#d4813a', label: 'Amber' },
  { hex: '#f5a623', label: 'Gold' },
  { hex: '#ffffff', label: 'White' },
  { hex: '#000000', label: 'Black' },
  { hex: '#8b1e1e', label: 'Deep red' },
  { hex: '#1d5e38', label: 'Forest' },
  { hex: '#2b4c7e', label: 'Navy' },
  { hex: '#6b5d4f', label: 'Stone' },
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A short hex expands so the native picker (which needs 6 digits) agrees. */
export function normalizeHex(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim();
  if (!HEX_RE.test(v)) return null;
  if (v.length === 4) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`.toLowerCase();
  }
  return v.toLowerCase();
}

const swatchStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
};

export function HeroColorField({
  id,
  label,
  value,
  placeholder,
  onChange,
  testIdPrefix,
}: {
  id: string;
  label: string;
  /** Current stored value, or null/'' when the default is in force. */
  value: string | null | undefined;
  /** What the element looks like when nothing is chosen. */
  placeholder?: string;
  onChange: (hex: string | null) => void;
  testIdPrefix: string;
}) {
  const normalized = normalizeHex(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          id={id}
          type="color"
          data-testid={`${testIdPrefix}-picker`}
          // The picker cannot show "unset", so it falls back to a neutral while
          // the hex field alongside stays empty to show nothing is chosen.
          value={normalized ?? '#1c1408'}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          style={{
            width: 44,
            height: 40,
            padding: 2,
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
          }}
          aria-label={`${label} colour picker`}
        />
        <input
          type="text"
          data-testid={`${testIdPrefix}-hex`}
          value={normalized ?? String(value ?? '')}
          placeholder={placeholder ?? 'Default'}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === '') {
              onChange(null);
              return;
            }
            onChange(HEX_RE.test(v) ? v.toLowerCase() : v);
          }}
          style={{
            height: 40,
            width: 108,
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            padding: '0 10px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 13,
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
          aria-label={`${label} hex value`}
        />
        {value ? (
          <button
            type="button"
            data-testid={`${testIdPrefix}-clear`}
            onClick={() => onChange(null)}
            style={{
              height: 40,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {HERO_QUICK_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            aria-label={c.label}
            data-testid={`${testIdPrefix}-quick-${c.hex.slice(1)}`}
            onClick={() => onChange(c.hex)}
            style={{
              ...swatchStyle,
              background: c.hex,
              border: normalized === c.hex ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
