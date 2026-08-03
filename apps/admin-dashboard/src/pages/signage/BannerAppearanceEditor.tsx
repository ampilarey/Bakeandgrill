import type { CSSProperties } from 'react';
import type { SignageBannerItem } from '../../api';
import { Select } from '../../components/SharedUI';
import {
  alphaToTransparencyPercent,
  composeFromPicker,
  DEFAULT_BG_TRANSPARENCY_PERCENT,
  EDGE_CLEAR_INSET_PERCENT,
  edgeClearChecked,
  FONT_SIZE_OPTIONS,
  formatStoredColor,
  HEIGHT_SIZE_OPTIONS,
  nearestPresetValue,
  parseCssColor,
  rgbMatch,
  themeSwatches,
  toHex,
  transparencyPercentToAlpha,
  type ThemeSwatch,
} from './bannerAppearanceUx';

type Props = {
  banner: SignageBannerItem;
  theme: Record<string, string | undefined>;
  onPatch: (patch: Partial<SignageBannerItem>) => void;
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
  marginBottom: 8,
};

function SwatchRow({
  swatches,
  value,
  onPick,
  testIdPrefix,
}: {
  swatches: ThemeSwatch[];
  value: string;
  onPick: (color: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid={testIdPrefix}>
      {swatches.map((s) => {
        const isSelected = rgbMatch(value, s.color);
        return (
          <button
            key={s.key}
            type="button"
            title={s.label}
            aria-label={s.label}
            aria-pressed={isSelected}
            data-testid={`${testIdPrefix}-${s.key}`}
            onClick={() => onPick(s.color)}
            style={{
              width: 36,
              height: 36,
              minHeight: 36,
              borderRadius: 10,
              border: isSelected ? '2.5px solid var(--color-primary)' : '1.5px solid var(--color-border)',
              boxShadow: isSelected ? '0 0 0 2px var(--color-warning-bg)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              background: s.color,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

function ColorPickerRow({
  label,
  value,
  onChange,
  withTransparency,
  testId,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  withTransparency?: boolean;
  testId: string;
}) {
  const parsed = parseCssColor(value) ?? { r: 12, g: 8, b: 4, a: withTransparency ? transparencyPercentToAlpha(DEFAULT_BG_TRANSPARENCY_PERCENT) : 1 };
  const hex = toHex(parsed);
  const transparency = alphaToTransparencyPercent(parsed.a);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1.5px solid var(--color-border)',
              background: withTransparency ? value : hex,
              flexShrink: 0,
            }}
          />
          Custom…
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              const nextHex = e.target.value;
              if (withTransparency) {
                onChange(composeFromPicker(nextHex, parsed.a));
              } else {
                onChange(formatStoredColor({ ...parseCssColor(nextHex)!, a: 1 }));
              }
            }}
            data-testid={`${testId}-picker`}
            style={{ width: 44, height: 36, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </label>
      </div>
      {withTransparency && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span style={{ fontWeight: 600 }}>Transparency · {transparency}%</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={transparency}
            onChange={(e) => {
              const alpha = transparencyPercentToAlpha(Number(e.target.value));
              onChange(composeFromPicker(hex, alpha));
            }}
            data-testid={`${testId}-transparency`}
            style={{ width: '100%', maxWidth: 320, minHeight: 36 }}
          />
        </label>
      )}
      <span style={{ fontSize: 11, color: 'var(--color-text-muted, var(--color-text-secondary))' }}>{label}</span>
    </div>
  );
}

export function BannerAppearanceEditor({ banner, theme, onPatch }: Props) {
  const id = banner.id;
  const swatches = themeSwatches(theme);
  const textColor = banner.text_color || '#fff8f0';
  const bgColor = banner.background_color || 'rgba(12, 8, 4, 0.78)';
  const fontNearest = nearestPresetValue(banner.font_scale ?? 1, FONT_SIZE_OPTIONS);
  const heightNearest = nearestPresetValue(banner.height_scale ?? 1, HEIGHT_SIZE_OPTIONS);
  const scrollMode = (['ticker', 'seamless', 'static'] as const).includes(banner.scroll_mode as 'ticker')
    ? String(banner.scroll_mode)
    : 'seamless';
  const isStatic = scrollMode === 'static';
  const align = banner.align === 'center' || banner.align === 'right' ? banner.align : 'left';
  const dateFormat = (['full', 'short', 'numeric', 'weekday', 'hijri'] as const).includes(
    banner.date_format as 'full',
  )
    ? String(banner.date_format)
    : 'full';
  const edgeOn = edgeClearChecked(banner.inset_percent ?? 0);

  const applyTextSwatch = (color: string) => {
    const p = parseCssColor(color);
    onPatch({ text_color: p ? formatStoredColor({ ...p, a: 1 }) : color });
  };

  const applyBgSwatch = (color: string) => {
    const current = parseCssColor(bgColor);
    const alpha = current?.a ?? transparencyPercentToAlpha(DEFAULT_BG_TRANSPARENCY_PERCENT);
    const p = parseCssColor(color);
    if (!p) {
      onPatch({ background_color: color });
      return;
    }
    onPatch({ background_color: formatStoredColor({ ...p, a: alpha }) });
  };

  return (
    <details data-testid={`signage-banner-appearance-${id}`} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--color-text)', minHeight: 36, display: 'flex', alignItems: 'center' }}>
        Appearance
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
        <div>
          <div style={labelStyle}>Text colour</div>
          <SwatchRow
            swatches={swatches}
            value={textColor}
            onPick={applyTextSwatch}
            testIdPrefix={`signage-banner-text-swatch-${id}`}
          />
          <div style={{ marginTop: 10 }}>
            <ColorPickerRow
              label="Pick any colour for the banner text"
              value={textColor}
              onChange={(next) => onPatch({ text_color: next })}
              testId={`signage-banner-text-color-${id}`}
            />
          </div>
        </div>

        <div>
          <div style={labelStyle}>Background</div>
          <SwatchRow
            swatches={swatches}
            value={bgColor}
            onPick={applyBgSwatch}
            testIdPrefix={`signage-banner-bg-swatch-${id}`}
          />
          <div style={{ marginTop: 10 }}>
            <ColorPickerRow
              label="Background colour and how see-through it is"
              value={bgColor}
              withTransparency
              onChange={(next) => onPatch({ background_color: next })}
              testId={`signage-banner-bg-color-${id}`}
            />
          </div>
        </div>

        <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Select
            label="Font size"
            value={String(fontNearest)}
            onChange={(val) => onPatch({ font_scale: Number.parseFloat(val) || 1 })}
            options={FONT_SIZE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            data-testid={`signage-banner-font-scale-${id}`}
          />
          <Select
            label="Banner height"
            value={String(heightNearest)}
            onChange={(val) => onPatch({ height_scale: Number.parseFloat(val) || 1 })}
            options={HEIGHT_SIZE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
            data-testid={`signage-banner-height-scale-${id}`}
          />
          <Select
            label="Date format"
            value={dateFormat}
            onChange={(val) => onPatch({ date_format: val })}
            options={[
              { value: 'full', label: 'Full (Mon, 3 Aug 2026)' },
              { value: 'short', label: 'Short (Mon, 3 Aug)' },
              { value: 'numeric', label: 'Numeric (03/08/2026)' },
              { value: 'weekday', label: 'Weekday only' },
              { value: 'hijri', label: 'Hijri (approx.)' },
            ]}
            data-testid={`signage-banner-date-format-${id}`}
          />
        </div>

        <details data-testid={`signage-banner-advanced-${id}`} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, color: 'var(--color-text)', minHeight: 36, display: 'flex', alignItems: 'center' }}>
            Advanced
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {isStatic && (
              <Select
                label="Align"
                value={align}
                onChange={(val) => onPatch({ align: val })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
                data-testid={`signage-banner-align-${id}`}
              />
            )}

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={edgeOn}
                  onChange={(e) => onPatch({
                    inset_percent: e.target.checked ? EDGE_CLEAR_INSET_PERCENT : 0,
                  })}
                  style={{ width: 18, height: 18 }}
                  data-testid={`signage-banner-inset-${id}`}
                />
                Keep clear of screen edges
              </label>
              <p style={{ margin: '0 0 0 26px', fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 480 }}>
                Turn on if your TV cuts off the edge of the picture.
              </p>
            </div>
          </div>
        </details>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
          Hijri uses the Umm al-Qura calendar and can differ by a day from locally observed dates.
        </p>
      </div>
    </details>
  );
}
