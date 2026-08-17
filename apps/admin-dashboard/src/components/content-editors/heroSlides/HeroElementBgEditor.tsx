import type { CSSProperties } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { HeroColorField } from './HeroColorField';
import { heroContrast } from '../../../utils/heroContrast';
import {
  resolveHeroElementStyle,
  resolveHeroSlidePresentation,
  type HeroElementKey,
  type HeroPresentationPatch,
} from '../../../utils/heroSlidePresentation';
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

const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 10,
  borderRadius: 8,
  border: '1px solid var(--color-border-light)',
  background: 'var(--color-surface)',
};

const groupTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-text-muted)',
};

const checkRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: 'var(--color-text)',
  minHeight: 44,
};

const hintStyle: CSSProperties = { margin: 0, fontSize: 11, color: 'var(--color-text-muted)' };

/** 0–100 slider unless a range is given; the resolver maps it to a length. */
function SliderRow({
  id,
  label,
  value,
  onChange,
  testId,
  min = 0,
  max = 100,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId: string;
  min?: number;
  max?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : min}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', maxWidth: 320, accentColor: 'var(--color-primary)' }}
      />
    </div>
  );
}

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
  const st = resolveHeroElementStyle(slide as Record<string, unknown>, key);
  const row = slide as Record<string, unknown>;
  const styled = key === 'title' || key === 'subtitle';
  /** Patch one field, keeping the background token so the row stays coherent. */
  const setField = (field: string, value: unknown) =>
    applyPresentation(idx, { [field]: value } as unknown as HeroPresentationPatch);
  const contrast = styled ? heroContrast(st.text_color, el.css) : null;
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
                ...(key === 'title' || key === 'subtitle'
                  ? { [`${key}_bg_full_width`]: null, [`${key}_bg_shape`]: null }
                  : {}),
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Background shape
              </span>
              <div
                role="radiogroup"
                aria-label={`${ELEMENT_LABELS[key]} background shape`}
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
              >
                {([
                  ['line', 'Each line'],
                  ['hug', 'One box'],
                  ['full', 'Full width'],
                  ['outline', 'Outline only'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={el.shape === value}
                    data-testid={`hero-bg-shape-${idx}-${key}-${value}`}
                    onClick={() => applyPresentation(idx, {
                      [`${key}_bg`]: storedToken,
                      [`${key}_bg_strength`]: strength,
                      [`${key}_bg_shape`]: value,
                      // Keep the legacy flag agreeing with the shape so older
                      // readers of the slide do not disagree with this one.
                      [`${key}_bg_full_width`]: value === 'full',
                    } as HeroPresentationPatch)}
                    style={{
                      ...btnStyle,
                      height: 36,
                      fontWeight: el.shape === value ? 700 : 600,
                      background: el.shape === value ? 'var(--color-warning-bg)' : 'var(--color-surface)',
                      borderColor: el.shape === value ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)' }}>
                {el.shape === 'line'
                  ? 'Every line gets its own small background that hugs just that line — including when the words wrap on a phone.'
                  : el.shape === 'hug'
                    ? 'One box around all the words. Two lines share a single rectangle.'
                    : el.shape === 'full'
                      ? 'An edge-to-edge bar across the banner.'
                      : 'No box — the letters get a coloured outline and soft halo instead.'}
              </p>
            </div>
          ) : null}
          {styled ? (
            <>
              {/* ── Colours ─────────────────────────────────────────────── */}
              <div style={groupStyle}>
                <span style={groupTitleStyle}>Colours</span>
                <HeroColorField
                  id={`hero-${idx}-${key}-text-color`}
                  label="Text colour"
                  value={row[`${key}_text_color`] as string | undefined}
                  placeholder={key === 'title' ? 'White' : 'Soft white'}
                  onChange={(v) => setField(`${key}_text_color`, v)}
                  testIdPrefix={`hero-text-color-${idx}-${key}`}
                />
                <HeroColorField
                  id={`hero-${idx}-${key}-em-color`}
                  label="Emphasis colour — the <em> part"
                  value={row[`${key}_em_color`] as string | undefined}
                  placeholder="Same as text"
                  onChange={(v) => setField(`${key}_em_color`, v)}
                  testIdPrefix={`hero-em-color-${idx}-${key}`}
                />
                <HeroColorField
                  id={`hero-${idx}-${key}-bg-color2`}
                  label="Second background colour — blends into a gradient"
                  value={row[`${key}_bg_color2`] as string | undefined}
                  placeholder="No gradient"
                  onChange={(v) => setField(`${key}_bg_color2`, v)}
                  testIdPrefix={`hero-bg2-${idx}-${key}`}
                />
                {contrast ? (
                  <p
                    data-testid={`hero-contrast-${idx}-${key}`}
                    data-level={contrast.level}
                    style={{
                      margin: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        contrast.level === 'poor'
                          ? 'var(--color-danger)'
                          : contrast.level === 'ok'
                            ? 'var(--color-warning)'
                            : 'var(--color-success)',
                    }}
                  >
                    {contrast.message}
                  </p>
                ) : null}
              </div>

              {/* ── Outline & border ────────────────────────────────────── */}
              <div style={groupStyle}>
                <span style={groupTitleStyle}>Outline &amp; border</span>
                <label style={checkRowStyle}>
                  <input
                    type="checkbox"
                    data-testid={`hero-outline-${idx}-${key}`}
                    checked={st.outline}
                    onChange={(e) => setField(`${key}_outline`, e.target.checked ? '1' : '0')}
                  />
                  Outline around the letters
                </label>
                {st.outline ? (
                  <>
                    <HeroColorField
                      id={`hero-${idx}-${key}-outline-color`}
                      label="Letter outline colour"
                      value={row[`${key}_outline_color`] as string | undefined}
                      placeholder="Background colour"
                      onChange={(v) => setField(`${key}_outline_color`, v)}
                      testIdPrefix={`hero-outline-color-${idx}-${key}`}
                    />
                    <SliderRow
                      id={`hero-${idx}-${key}-outline-width`}
                      label="Outline thickness"
                      value={Number(row[`${key}_outline_width`] ?? 30)}
                      onChange={(v) => setField(`${key}_outline_width`, v)}
                      testId={`hero-outline-width-${idx}-${key}`}
                    />
                  </>
                ) : null}
                <label style={checkRowStyle}>
                  <input
                    type="checkbox"
                    data-testid={`hero-border-${idx}-${key}`}
                    checked={st.border}
                    onChange={(e) => setField(`${key}_border`, e.target.checked ? '1' : '0')}
                  />
                  Border around the background box
                </label>
                {st.border ? (
                  <>
                    <HeroColorField
                      id={`hero-${idx}-${key}-border-color`}
                      label="Box border colour"
                      value={row[`${key}_border_color`] as string | undefined}
                      placeholder="Soft white"
                      onChange={(v) => setField(`${key}_border_color`, v)}
                      testIdPrefix={`hero-border-color-${idx}-${key}`}
                    />
                    <SliderRow
                      id={`hero-${idx}-${key}-border-width`}
                      label="Border thickness"
                      value={Number(row[`${key}_border_width`] ?? 20)}
                      onChange={(v) => setField(`${key}_border_width`, v)}
                      testId={`hero-border-width-${idx}-${key}`}
                    />
                  </>
                ) : null}
                <p style={hintStyle}>
                  These are separate on purpose — a background box can carry a letter
                  outline too, each in its own colour.
                </p>
              </div>

              {/* ── Shape & spacing ─────────────────────────────────────── */}
              <div style={groupStyle}>
                <span style={groupTitleStyle}>Box roundness &amp; padding</span>
                <SliderRow
                  id={`hero-${idx}-${key}-radius`}
                  label="Corner roundness"
                  value={Number(row[`${key}_bg_radius`] ?? 27)}
                  onChange={(v) => setField(`${key}_bg_radius`, v)}
                  testId={`hero-radius-${idx}-${key}`}
                />
                <SliderRow
                  id={`hero-${idx}-${key}-pad-x`}
                  label="Side padding"
                  value={Number(row[`${key}_bg_pad_x`] ?? 20)}
                  onChange={(v) => setField(`${key}_bg_pad_x`, v)}
                  testId={`hero-pad-x-${idx}-${key}`}
                />
                <SliderRow
                  id={`hero-${idx}-${key}-pad-y`}
                  label="Top and bottom padding"
                  value={Number(row[`${key}_bg_pad_y`] ?? 8)}
                  onChange={(v) => setField(`${key}_bg_pad_y`, v)}
                  testId={`hero-pad-y-${idx}-${key}`}
                />
              </div>

              {/* ── Type ────────────────────────────────────────────────── */}
              <div style={groupStyle}>
                <span style={groupTitleStyle}>Size &amp; weight</span>
                <SliderRow
                  id={`hero-${idx}-${key}-font-scale`}
                  label={`Size — ${Number(row[`${key}_font_scale`] ?? 100)}% of normal`}
                  value={Number(row[`${key}_font_scale`] ?? 100)}
                  min={50}
                  max={200}
                  onChange={(v) => setField(`${key}_font_scale`, v)}
                  testId={`hero-font-scale-${idx}-${key}`}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Weight
                  </span>
                  <div role="radiogroup" aria-label="Font weight" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([400, 600, 700, 800, 900] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        role="radio"
                        aria-checked={(st.font_weight ?? (key === 'title' ? 800 : 400)) === w}
                        data-testid={`hero-font-weight-${idx}-${key}-${w}`}
                        onClick={() => setField(`${key}_font_weight`, w)}
                        style={{
                          ...btnStyle,
                          height: 36,
                          fontWeight: w,
                          background:
                            (st.font_weight ?? (key === 'title' ? 800 : 400)) === w
                              ? 'var(--color-warning-bg)'
                              : 'var(--color-surface)',
                          borderColor:
                            (st.font_weight ?? (key === 'title' ? 800 : 400)) === w
                              ? 'var(--color-primary)'
                              : 'var(--color-border)',
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
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
