import { useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourWord = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/*
 * Weekday × hour, darker where it sells more, only the hours that ever trade
 * so a phone keeps readable cells (2026-10-27).
 */
export function HeatGrid({ cells, value, format, testId }: {
  cells: { [k: string]: number }[][];
  value: (c: { [k: string]: number }) => number;
  format: (c: { [k: string]: number }) => string;
  testId?: string;
}) {
  const [tip, setTip] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...cells.flat().map(value));
  const used = Array.from({ length: 24 }, (_, h) => cells.some((row) => value(row[h]) > 0));
  let first = used.indexOf(true);
  let last = used.lastIndexOf(true);
  if (first < 0) { first = 8; last = 22; }
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  let best = { d: 0, h: first, v: -1 };
  cells.forEach((row, d) => row.forEach((c, h) => { if (value(c) > best.v) best = { d, h, v: value(c) }; }));

  return (
    <div data-testid={testId}>
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${hours.length}, minmax(0, 1fr))`, gap: 2, alignItems: 'center' }}>
        <span />
        {hours.map((h) => (
          <span key={h} style={{ fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center' }}>{(h - first) % 3 === 0 ? hourWord(h).replace(' ', '') : ''}</span>
        ))}
        {cells.map((row, d) => [
          <span key={`l${d}`} style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>{DAYS[d]}</span>,
          ...hours.map((h) => {
            const v = value(row[h]);
            return (
              <button
                type="button"
                key={`${d}-${h}`}
                className="si-cell"
                aria-label={`${DAYS[d]} ${hourWord(h)}: ${format(row[h])}`}
                onPointerEnter={() => setTip({ d, h })}
                onPointerLeave={() => setTip(null)}
                onFocus={() => setTip({ d, h })}
                onBlur={() => setTip(null)}
                style={{
                  background: v > 0 ? `color-mix(in srgb, var(--color-primary) ${Math.round(12 + (v / max) * 88)}%, var(--color-surface))` : 'var(--color-border-light)',
                  animationDelay: `${(d * hours.length + (h - first)) * 4}ms`,
                  outline: tip && tip.d === d && tip.h === h ? '2px solid var(--color-text)' : undefined,
                }}
              />
            );
          }),
        ])}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span>Less</span>
        {[0.12, 0.4, 0.7, 1].map((k) => (
          <span key={k} aria-hidden style={{ width: 16, height: 10, borderRadius: 3, background: `color-mix(in srgb, var(--color-primary) ${Math.round(k * 100)}%, var(--color-surface))` }} />
        ))}
        <span>More</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }} data-testid={testId ? `${testId}-tip` : undefined}>
          {tip ? `${DAYS[tip.d]} ${hourWord(tip.h)}: ${format(cells[tip.d][tip.h])}` : best.v > 0 ? `Busiest: ${DAYS[best.d]} ${hourWord(best.h)}` : 'Nothing sold yet'}
        </span>
      </div>
    </div>
  );
}
