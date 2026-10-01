import { useEffect, useState } from 'react';
import { type CutoutBackdrop, normalizeBackdrop } from '../api/cutout';

const FALLBACK_COLOR = '#F3EAE1';
const FALLBACK_STRENGTH = 100;
const STAND_IN = '/brand/logo-mark.png';

/**
 * The circle a cut-out sits on, drawn the way the cards draw it: a disc a
 * little smaller than the box so the dish can overhang, colour and strength
 * from the backdrop. Used for every live preview in admin.
 */
export function CutoutPreview({
  src,
  color,
  strength,
  size = 96,
  label,
}: {
  src?: string | null;
  color: string;
  strength: number;
  size?: number;
  label?: string;
}) {
  return (
    <div
      data-testid="cutout-preview"
      data-color={color}
      data-strength={strength}
      style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}
      aria-label={label}
    >
      <div
        style={{
          position: 'absolute', inset: '7%', borderRadius: '50%',
          background: color, opacity: Math.max(0, Math.min(1, strength / 100)),
        }}
      />
      <img
        src={src || STAND_IN}
        alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(28,20,8,0.18))',
          opacity: src ? 1 : 0.55,
        }}
      />
    </div>
  );
}

/**
 * Owner, 2026-10-01: "add option to control backdrop for all, for a specific
 * category, or sub category, and if i want separately for each item." One
 * editor for every level: either follow whatever is above, or set a colour
 * and a strength here. Either field may be left to inherit on its own.
 */
export function CutoutBackdropField({
  value,
  onChange,
  inheritLabel,
  inherited,
  previewSrc,
  disabled = false,
}: {
  value: CutoutBackdrop | null;
  onChange: (next: CutoutBackdrop | null) => void;
  /** Where the circle comes from when this level sets nothing, e.g. "the category". */
  inheritLabel: string;
  /** What that inherited circle looks like, for the preview and the inherit row. */
  inherited?: { color: string; strength: number } | null;
  previewSrc?: string | null;
  disabled?: boolean;
}) {
  const own = value !== null;
  const baseColor = inherited?.color ?? FALLBACK_COLOR;
  const baseStrength = inherited?.strength ?? FALLBACK_STRENGTH;
  const [hexText, setHexText] = useState(value?.color ?? '');

  useEffect(() => {
    setHexText(value?.color ?? '');
  }, [value?.color]);

  const effectiveColor = value?.color ?? baseColor;
  const effectiveStrength = value?.strength ?? baseStrength;

  const emit = (patch: Partial<CutoutBackdrop>) => {
    onChange({ color: value?.color ?? null, strength: value?.strength ?? null, ...patch });
  };

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }} data-testid="cutout-backdrop-field">
      <CutoutPreview src={previewSrc} color={effectiveColor} strength={effectiveStrength} label="Circle preview" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 220px', minWidth: 0 }}>
        <label style={{ ...rowStyle, cursor: disabled ? 'default' : 'pointer', fontSize: 13 }}>
          <input
            type="radio"
            name="cutout-backdrop-mode"
            checked={!own}
            disabled={disabled}
            onChange={() => onChange(null)}
            data-testid="cutout-backdrop-inherit"
          />
          <span>
            Same as {inheritLabel}
            {inherited ? (
              <span style={{ color: 'var(--color-text-muted)' }}> ({inherited.color}, {inherited.strength}%)</span>
            ) : null}
          </span>
        </label>
        <label style={{ ...rowStyle, cursor: disabled ? 'default' : 'pointer', fontSize: 13 }}>
          <input
            type="radio"
            name="cutout-backdrop-mode"
            checked={own}
            disabled={disabled}
            onChange={() => onChange({ color: baseColor, strength: baseStrength })}
            data-testid="cutout-backdrop-own"
          />
          <span>Its own circle</span>
        </label>

        {own && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 24 }}>
            <div style={rowStyle}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 64 }}>Colour</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(effectiveColor) ? effectiveColor : FALLBACK_COLOR}
                disabled={disabled}
                onChange={(e) => emit({ color: e.target.value.toUpperCase() })}
                aria-label="Circle colour"
                data-testid="cutout-backdrop-color"
                style={{ width: 40, height: 32, padding: 2, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={hexText}
                placeholder={baseColor}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.value;
                  setHexText(next);
                  if (/^#[0-9a-fA-F]{6}$/.test(next.trim())) emit({ color: next.trim().toUpperCase() });
                  else if (next.trim() === '') emit({ color: null });
                }}
                aria-label="Circle colour hex"
                style={{ width: 96, border: '1px solid var(--color-border)', borderRadius: 6, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              />
              {value?.color == null && (
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>inherits {baseColor}</span>
              )}
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', width: 64 }}>Strength</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={effectiveStrength}
                disabled={disabled}
                onChange={(e) => emit({ strength: Number(e.target.value) })}
                aria-label="Circle strength"
                data-testid="cutout-backdrop-strength"
                style={{ flex: '1 1 120px', minWidth: 0 }}
              />
              <span style={{ fontSize: 12, width: 40, fontVariantNumeric: 'tabular-nums' }}>{effectiveStrength}%</span>
              {value?.strength == null && (
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>inherits {baseStrength}%</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
              100 paints the circle solid, 40 leaves a faint tint, 0 hides it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export { normalizeBackdrop };
