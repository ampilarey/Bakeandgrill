import { useMemo, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

/*
 * A price over time, drawn as a line — the thing the owner asked for on
 * 2026-09-19: "Where i can see the price difference of each product over
 * time. An easy way to". Plain SVG, no chart library: a few dozen points,
 * one line, the dates along the bottom, the price up the side, and a dot you
 * can put a finger on to see who charged it.
 */

export interface ChartPoint {
  date: string;
  price: number;
  supplier?: string | null;
  brand?: string | null;
}

/**
 * The number without "MVR" — the axis says it once. Prices under one
 * rufiyaa (per gram, per ml) get up to four places, or every point on a
 * flour line reads "0.06".
 */
const money = (n: number) => n.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 4 : 2,
});

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Round bounds so the axis reads 10, 12, 14 rather than 10.37, 12.91. */
function niceBounds(min: number, max: number): [number, number] {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return [Math.max(0, min - pad), max + pad];
  }
  const span = max - min;
  const step = 10 ** Math.floor(Math.log10(span));
  const lo = Math.max(0, Math.floor(min / step) * step);
  const hi = Math.ceil(max / step) * step;
  return [lo, hi === lo ? lo + step : hi];
}

export function PriceHistoryChart({ points, unit, height = 220 }: { points: ChartPoint[]; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  // The SVG scales to its box, so on a phone the drawing is laid out at
  // phone width — otherwise the axis text shrinks to half size.
  const isMobile = useIsMobile();
  const width = isMobile ? 360 : 640;
  const pad = { top: 16, right: 16, bottom: 34, left: isMobile ? 50 : 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const model = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return null;
    const times = sorted.map((p) => new Date(`${p.date}T00:00:00`).getTime());
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const prices = sorted.map((p) => p.price);
    const [lo, hi] = niceBounds(Math.min(...prices), Math.max(...prices));
    const x = (t: number) => (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW);
    const y = (v: number) => innerH - ((v - lo) / (hi - lo)) * innerH;
    const xy = sorted.map((p, i) => ({ ...p, x: x(times[i]), y: y(p.price) }));
    const ticks = [lo, lo + (hi - lo) / 2, hi];
    const labelIdx = sorted.length <= 4
      ? sorted.map((_, i) => i)
      : [0, Math.floor((sorted.length - 1) / 3), Math.floor((2 * (sorted.length - 1)) / 3), sorted.length - 1];
    return { xy, ticks, labelIdx, lo, hi, first: sorted[0], last: sorted[sorted.length - 1] };
  }, [points, innerW, innerH, isMobile]);

  if (!model) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '8px 0' }}>No prices recorded yet.</p>;
  }

  const path = model.xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x + pad.left).toFixed(1)},${(p.y + pad.top).toFixed(1)}`).join(' ');
  const rise = model.last.price > model.first.price;
  const fall = model.last.price < model.first.price;
  const stroke = rise ? 'var(--color-danger)' : fall ? 'var(--color-success)' : 'var(--color-primary)';
  const active = hover != null ? model.xy[hover] : null;

  return (
    <div data-testid="price-history-chart" style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Price per ${unit ?? 'unit'} over time, ${money(model.first.price)} on ${shortDate(model.first.date)} to ${money(model.last.price)} on ${shortDate(model.last.date)}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        onMouseLeave={() => setHover(null)}
      >
        {model.ticks.map((t) => {
          const yy = pad.top + innerH - ((t - model.lo) / (model.hi - model.lo)) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} stroke="var(--color-border)" strokeDasharray="3 3" />
              <text x={pad.left - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">{money(t)}</text>
            </g>
          );
        })}
        {model.labelIdx.map((i) => (
          <text key={i} x={pad.left + model.xy[i].x} y={height - 10} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
            {shortDate(model.xy[i].date)}
          </text>
        ))}
        <path d={path} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {model.xy.map((p, i) => (
          <g key={i}>
            <circle cx={pad.left + p.x} cy={pad.top + p.y} r={hover === i ? 6 : 4} fill="var(--color-surface)" stroke={stroke} strokeWidth={2} />
            {/* A wide invisible hit area, so a finger finds the point. */}
            <rect
              x={pad.left + p.x - 14} y={pad.top} width={28} height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
              onClick={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      <div style={{ minHeight: 20, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }} aria-live="polite">
        {active ? (
          <>
            <strong style={{ color: 'var(--color-text)' }}>MVR {money(active.price)}</strong>
            {unit ? ` per ${unit}` : ''} · {shortDate(active.date)}
            {active.supplier ? ` · ${active.supplier}` : ''}
            {active.brand ? ` · ${active.brand}` : ''}
          </>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>Tap a point to see who charged it.</span>
        )}
      </div>
    </div>
  );
}

/** The same line at thumbnail size — one glance per row in a list. */
export function Sparkline({ points, width = 96, height = 28 }: { points: Array<{ date: string; price: number }>; width?: number; height?: number }) {
  if (points.length < 2) {
    return <span style={{ display: 'inline-block', width, height }} aria-hidden="true" />;
  }
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const y = (v: number) => (hi === lo ? height / 2 : height - 3 - ((v - lo) / (hi - lo)) * (height - 6));
  const step = width / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const first = prices[0];
  const last = prices[prices.length - 1];
  const stroke = last > first ? 'var(--color-danger)' : last < first ? 'var(--color-success)' : 'var(--color-text-muted)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(points.length - 1) * step} cy={y(last)} r={2.5} fill={stroke} />
    </svg>
  );
}
