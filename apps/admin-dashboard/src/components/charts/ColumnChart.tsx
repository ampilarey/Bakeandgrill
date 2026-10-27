import { useState } from 'react';

/*
 * A row of columns for a fixed set of buckets (the hours of the day, the days
 * of the week), one hue, the busiest marked, a value on hover or focus and in
 * the label row beneath (2026-10-27). Columns rise in (`.si-grow`, off under
 * reduced motion).
 */
export function ColumnChart({ bars, format, height = 150, testId, labelEvery = 1 }: {
  bars: { key: string; label: string; value: number; sub?: string; short?: string }[];
  format: (v: number) => string;
  height?: number;
  testId?: string;
  /** Show every n-th label under the columns (24 hours fit one in three). */
  labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const best = bars.reduce((bi, b, i) => (b.value > (bars[bi]?.value ?? -1) ? i : bi), 0);
  const shown = hover ?? (bars[best]?.value > 0 ? best : null);
  return (
    <div data-testid={testId}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', minHeight: 18, marginBottom: 6 }} data-testid={testId ? `${testId}-tip` : undefined}>
        {shown !== null && bars[shown] ? (
          <><strong style={{ color: 'var(--color-text)' }}>{format(bars[shown].value)}</strong> · {bars[shown].label}{bars[shown].sub ? ` · ${bars[shown].sub}` : ''}{hover === null ? ' (busiest)' : ''}</>
        ) : 'Nothing sold yet.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 2, alignItems: 'end', height }}>
        {bars.map((b, i) => (
          <button
            type="button"
            key={b.key}
            aria-label={`${b.label}: ${format(b.value)}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            style={{ height: '100%', display: 'flex', alignItems: 'flex-end', padding: 0, border: 0, background: 'transparent', cursor: 'default' }}
          >
            <span
              className="si-grow"
              style={{
                display: 'block', width: '100%', maxWidth: 24, margin: '0 auto',
                height: `${Math.max(b.value > 0 ? 3 : 0, (b.value / max) * 100)}%`,
                borderRadius: '4px 4px 0 0',
                background: 'var(--color-primary)',
                opacity: hover === null ? (i === best ? 1 : 0.7) : hover === i ? 1 : 0.45,
                animationDelay: `${Math.min(500, i * 18)}ms`,
              }}
            />
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`, gap: 2, marginTop: 4, borderTop: '1px solid var(--color-border-light)', paddingTop: 4 }}>
        {bars.map((b, i) => (
          <span key={b.key} style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}>{i % labelEvery === 0 ? (b.short ?? b.label) : ''}</span>
        ))}
      </div>
    </div>
  );
}
