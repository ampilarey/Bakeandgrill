import { ChevronDown, ChevronRight } from 'lucide-react';
import { resolveHeroSlidePresentation, type HeroElementKey, type HeroPresentationPatch } from '../../../utils/heroSlidePresentation';
import { BG_SWATCHES, btnStyle, ELEMENT_LABELS, type HeroSlideRow } from './heroSlidesModel';

export type HeroElementBgEditorProps = {
  slide: HeroSlideRow;
  idx: number;
  elementKey: HeroElementKey;
  open: boolean;
  onToggleOpen: () => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  applyPresentation: (idx: number, patch: HeroPresentationPatch) => void;
};

export function HeroElementBgEditor({
  slide,
  idx,
  elementKey: key,
  open,
  onToggleOpen,
  advancedOpen: advOpen,
  onToggleAdvanced,
  applyPresentation,
}: HeroElementBgEditorProps) {
  const el = resolveHeroSlidePresentation(slide).elements[key];
  const storedToken = String((slide as Record<string, unknown>)[`${key}_bg`] ?? '').trim().toLowerCase();
  const strength = el.strength ?? 70;
  const isCustomHex = Boolean(storedToken) && !['none', 'dark', 'light', 'amber', 'brand_dark', 'glass'].includes(storedToken);

  return (
    <div
      data-testid={`hero-element-bg-${idx}-${key}`}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        background: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          minHeight: 44,
        }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', flex: 1 }}>
          {ELEMENT_LABELS[key]} background
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {el.token ? (el.token === 'none' ? 'None' : el.token) : 'Default'}
        </span>
      </button>
      {open ? (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="radiogroup" aria-label={`${ELEMENT_LABELS[key]} background colour`}>
            <button
              type="button"
              role="radio"
              aria-checked={!storedToken}
              data-testid={`hero-bg-swatch-${idx}-${key}-default`}
              onClick={() => applyPresentation(idx, {
                [`${key}_bg`]: null,
                [`${key}_bg_strength`]: null,
                ...(key === 'title' || key === 'subtitle' ? { [`${key}_bg_full_width`]: null } : {}),
              } as HeroPresentationPatch)}
              style={{
                ...btnStyle,
                fontWeight: !storedToken ? 700 : 600,
                borderColor: !storedToken ? 'var(--color-primary)' : 'var(--color-border)',
                background: !storedToken ? 'var(--color-warning-bg)' : 'var(--color-surface)',
              }}
            >
              Default
            </button>
            {BG_SWATCHES.map((swatch) => {
              const selected = storedToken === swatch.id;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`hero-bg-swatch-${idx}-${key}-${swatch.id}`}
                  onClick={() => applyPresentation(idx, {
                    [`${key}_bg`]: swatch.id,
                    // Glass defaults to 10% opacity (same as secondary CTA fill)
                    [`${key}_bg_strength`]: swatch.id === 'glass' && storedToken !== 'glass' ? 10 : strength,
                  } as HeroPresentationPatch)}
                  style={{
                    ...btnStyle,
                    fontWeight: selected ? 700 : 600,
                    borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
                    background: selected ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: '1px solid var(--color-border)',
                      background: swatch.color === 'transparent'
                        ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px'
                        : swatch.id === 'glass'
                          ? 'linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.12))'
                          : swatch.color,
                    }}
                  />
                  {swatch.label}
                </button>
              );
            })}
          </div>
          {storedToken && storedToken !== 'none' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                htmlFor={`hero-${idx}-${key}-bg-strength`}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}
              >
                {storedToken === 'glass' ? 'Opacity' : 'Strength'} — {strength}%
              </label>
              <input
                id={`hero-${idx}-${key}-bg-strength`}
                type="range"
                min={0}
                max={100}
                value={strength}
                onChange={(e) => applyPresentation(idx, {
                  [`${key}_bg`]: storedToken,
                  [`${key}_bg_strength`]: Number(e.target.value),
                } as HeroPresentationPatch)}
                style={{ width: '100%', maxWidth: 320, accentColor: 'var(--color-primary)' }}
                aria-label={`${ELEMENT_LABELS[key]} background strength`}
              />
            </div>
          ) : null}
          {(key === 'title' || key === 'subtitle') && storedToken && storedToken !== 'none' ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text)', minHeight: 44 }}>
              <input
                type="checkbox"
                checked={el.full_width}
                onChange={(e) => applyPresentation(idx, {
                  [`${key}_bg`]: storedToken,
                  [`${key}_bg_strength`]: strength,
                  [`${key}_bg_full_width`]: e.target.checked,
                } as HeroPresentationPatch)}
              />
              Full-width bar (off = {storedToken === 'glass' ? 'glass panel around the words' : 'letter outline / halo — no box'})
            </label>
          ) : null}
          <div>
            <button
              type="button"
              onClick={onToggleAdvanced}
              style={{ ...btnStyle, height: 36 }}
            >
              {advOpen ? 'Hide advanced' : 'Advanced'}
            </button>
            {advOpen ? (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  htmlFor={`hero-${idx}-${key}-bg-hex`}
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}
                >
                  Custom hex
                </label>
                <input
                  id={`hero-${idx}-${key}-bg-hex`}
                  value={isCustomHex ? storedToken : ''}
                  placeholder="#1c1408"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (!v) {
                      applyPresentation(idx, { [`${key}_bg`]: null } as HeroPresentationPatch);
                      return;
                    }
                    applyPresentation(idx, {
                      [`${key}_bg`]: v,
                      [`${key}_bg_strength`]: strength,
                    } as HeroPresentationPatch);
                  }}
                  style={{
                    height: 40,
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    padding: '0 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    color: 'var(--color-text)',
                    width: '100%',
                    maxWidth: 200,
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
