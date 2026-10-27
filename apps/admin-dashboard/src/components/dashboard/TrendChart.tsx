import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TrendGroup, TrendPoint } from '../../api';
import { change, compact, formatMetric, metricOf, niceTicks, pointLabel, valueOf, type MetricKey } from './salesInsightsMath';

/*
 * One metric over the period, as an area or as columns, with the period before
 * it as a grey line behind (owner, 2026-10-27: "more advanced graphics …
 * and animations"). The line draws itself in, columns rise from the baseline,
 * and a crosshair finds the nearest point under the finger or pointer; the
 * arrow keys walk it too. Reduced motion turns the movement off (index.css).
 */

type Props = {
  points: TrendPoint[];
  previous: TrendPoint[];
  metric: MetricKey;
  group: TrendGroup;
  kind: 'area' | 'bars';
  compare: boolean;
  /** Changes whenever the drawing should play again. */
  playKey: string;
};

const H = 260;
const M = { top: 18, right: 12, bottom: 30, left: 46 };

export function TrendChart({ points, previous, metric, group, kind, compare, playKey }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setHover(null); }, [playKey]);

  const n = points.length;
  const values = points.map((p) => valueOf(p, metric));
  const prevValues = previous.map((p) => valueOf(p, metric));
  const showPrev = compare && previous.length > 0;
  const top = Math.max(1, ...values, ...(showPrev ? prevValues : [0]));
  const ticks = useMemo(() => niceTicks(top), [top]);
  const yMax = ticks[ticks.length - 1] || 1;

  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;
  const band = n > 0 ? innerW / n : innerW;
  const x = (i: number) => M.left + band * (i + 0.5);
  const y = (v: number) => M.top + innerH - (Math.max(0, v) / yMax) * innerH;
  const base = M.top + innerH;

  const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = n > 0 ? `${line(values)} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z` : '';
  const prevLine = showPrev ? line(prevValues.slice(0, Math.max(n, prevValues.length))) : '';

  // Thin the x labels so they never touch: about one per 64px.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 64))));
  const barW = Math.min(24, Math.max(3, band * 0.62));
  const peak = values.length ? values.indexOf(Math.max(...values)) : -1;

  const pick = (clientX: number) => {
    const el = wrap.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    setHover(Math.min(n - 1, Math.max(0, Math.floor((px - M.left) / band))));
  };

  const h = hover;
  const tipLeft = h !== null ? Math.min(Math.max(x(h), 90), width - 90) : 0;
  const m = metricOf(metric);

  return (
    <div ref={wrap} className="si-chart" style={{ position: 'relative', width: '100%' }} data-testid="si-chart">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${m.label} by ${group}`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setHover((v) => Math.min(n - 1, (v ?? -1) + 1)); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((v) => Math.max(0, (v ?? n) - 1)); }
          if (e.key === 'Escape') setHover(null);
        }}
        onBlur={() => setHover(null)}
        style={{ display: 'block', touchAction: 'pan-y', outline: 'none' }}
      >
        <defs>
          <linearGradient id={`g${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-border-light)" strokeWidth={1} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(t)}</text>
          </g>
        ))}

        {points.map((p, i) => (i % every === 0 ? (
          <text key={p.key} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">{pointLabel(p, group, true)}</text>
        ) : null))}

        <g key={playKey}>
          {kind === 'area' ? (
            <>
              <path d={area} fill={`url(#g${gradId})`} className="si-fade" />
              <path d={line(values)} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="si-draw" />
              {n <= 40 && values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} className="si-pop" style={{ animationDelay: `${Math.min(600, i * 18)}ms` }} />
              ))}
            </>
          ) : (
            values.map((v, i) => {
              const bh = Math.max(0, base - y(v));
              const bx = x(i) - barW / 2;
              const r = Math.min(4, bh, barW / 2);
              const d = bh <= 0 ? '' : `M${bx},${base} V${base - bh + r} Q${bx},${base - bh} ${bx + r},${base - bh} H${bx + barW - r} Q${bx + barW},${base - bh} ${bx + barW},${base - bh + r} V${base} Z`;
              return (
                <path key={i} d={d} fill="var(--color-primary)" opacity={h === null || h === i ? 1 : 0.55} className="si-grow" style={{ animationDelay: `${Math.min(500, i * 16)}ms` }} />
              );
            })
          )}
          {showPrev && (
            <path d={prevLine} fill="none" stroke="var(--color-text-muted)" strokeOpacity={0.7} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="si-draw si-draw--late" data-testid="si-prev-line" />
          )}
          {peak >= 0 && values[peak] > 0 && h === null && (
            <text x={Math.min(Math.max(x(peak), M.left + 40), width - M.right - 40)} y={Math.max(12, y(values[peak]) - 10)} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-text-secondary)" className="si-fade si-fade--late">
              {m.money ? `Best ${compact(values[peak])}` : `Most ${compact(values[peak])}`}
            </text>
          )}
        </g>

        {h !== null && (
          <g pointerEvents="none">
            <line x1={x(h)} x2={x(h)} y1={M.top} y2={base} stroke="var(--color-text-muted)" strokeWidth={1} />
            {showPrev && prevValues[h] !== undefined && <circle cx={x(h)} cy={y(prevValues[h])} r={4} fill="var(--color-text-muted)" stroke="var(--color-surface)" strokeWidth={2} />}
            <circle cx={x(h)} cy={y(values[h])} r={5} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>

      {h !== null && points[h] && (
        <div className="si-tip" role="status" data-testid="si-tip" style={{ left: tipLeft }}>
          <strong style={{ fontSize: 15 }}>{formatMetric(metric, values[h])}</strong>
          <span style={{ color: 'var(--color-text-secondary)' }}>{pointLabel(points[h], group)}</span>
          {showPrev && previous[h] && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
              <span aria-hidden style={{ width: 12, height: 2, background: 'var(--color-text-muted)', borderRadius: 1 }} />
              {formatMetric(metric, prevValues[h])} · {pointLabel(previous[h], group)}
            </span>
          )}
          {showPrev && previous[h] && (() => {
            const c = change(values[h], prevValues[h]);
            if (c.pct === null) return null;
            const good = (c.diff >= 0) === m.upIsGood;
            return <span style={{ fontWeight: 700, color: c.diff === 0 ? 'var(--color-text-muted)' : good ? 'var(--color-success-strong)' : 'var(--color-danger-strong)' }}>{c.diff >= 0 ? '+' : ''}{c.pct.toFixed(1)}%</span>;
          })()}
        </div>
      )}
    </div>
  );
}
