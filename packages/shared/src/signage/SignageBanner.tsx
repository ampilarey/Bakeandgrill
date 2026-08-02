import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { SignageBannerSettings, SignagePrayerEntry } from './types';

export type SignageBannerProps = {
  banner: SignageBannerSettings;
  schedule: SignagePrayerEntry[];
  /** Live clock tick — when omitted, component ticks itself every 30s. */
  nowMs?: number;
  mode?: string;
  burnInOffset?: { x: number; y: number };
  /** Override date/time labels (tests / designer). */
  dateLabel?: string;
  timeLabel?: string;
};

export function pickNextPrayer(
  schedule: SignagePrayerEntry[],
  nowMs: number,
): SignagePrayerEntry | null {
  let next: SignagePrayerEntry | null = null;
  let nextAt = Number.POSITIVE_INFINITY;
  for (const entry of schedule) {
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at) || at <= nowMs) continue;
    if (at < nextAt) {
      nextAt = at;
      next = entry;
    }
  }
  return next;
}

/** Minute-granularity remaining string, e.g. "in 2h 14m" / "in 45m" / "in <1m". */
export function formatCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'now';
  const totalMin = Math.max(0, Math.floor(remainingMs / 60_000));
  if (totalMin < 1) return 'in <1m';
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours <= 0) return `in ${mins}m`;
  if (mins <= 0) return `in ${hours}h`;
  return `in ${hours}h ${mins}m`;
}

export function shouldShowBanner(banner: SignageBannerSettings | null | undefined, mode?: string): boolean {
  if (!banner?.enabled) return false;
  const m = mode ?? 'normal';
  if (m === 'prayer_break' || m.startsWith('emergency:')) return false;
  return true;
}

function defaultDateLabel(now: Date): string {
  return now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function defaultTimeLabel(now: Date): string {
  return now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildBannerSegments(opts: {
  fields: string[];
  dateLabel: string;
  timeLabel: string;
  next: SignagePrayerEntry | null;
  nowMs: number;
}): string[] {
  const parts: string[] = [];
  const fields = opts.fields.length > 0
    ? opts.fields
    : ['date', 'time', 'next_prayer', 'countdown'];

  for (const field of fields) {
    if (field === 'date') parts.push(opts.dateLabel);
    else if (field === 'time') parts.push(opts.timeLabel);
    else if (field === 'next_prayer') {
      if (opts.next) parts.push(`Next prayer · ${opts.next.name}`);
    } else if (field === 'countdown') {
      if (opts.next) {
        const at = Date.parse(opts.next.at);
        if (Number.isFinite(at)) {
          parts.push(formatCountdown(at - opts.nowMs));
        }
      }
    }
  }
  return parts.filter(Boolean);
}

export function SignageBanner({
  banner,
  schedule,
  nowMs: nowMsProp,
  mode = 'normal',
  burnInOffset,
  dateLabel,
  timeLabel,
}: SignageBannerProps) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (nowMsProp != null) return;
    const id = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [nowMsProp]);

  const nowMs = nowMsProp ?? tick;
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  if (!shouldShowBanner(banner, mode)) return null;

  const next = pickNextPrayer(schedule, nowMs);
  const segments = buildBannerSegments({
    fields: banner.fields ?? [],
    dateLabel: dateLabel ?? defaultDateLabel(now),
    timeLabel: timeLabel ?? defaultTimeLabel(now),
    next,
    nowMs,
  });

  // Never render an empty strip — fall back to date/time when schedule is empty
  // or fields only requested prayer info.
  const display = segments.length > 0
    ? segments
    : [dateLabel ?? defaultDateLabel(now), timeLabel ?? defaultTimeLabel(now)];

  const speed = Math.max(10, Math.min(180, Number(banner.speed_seconds) || 40));
  const position = banner.position === 'top' ? 'top' : 'bottom';
  const drift: CSSProperties = burnInOffset
    ? { transform: `translate(${burnInOffset.x}px, ${burnInOffset.y}px)` }
    : {};

  const text = display.join('   ·   ');
  // Duplicate for seamless marquee loop
  const marquee = `${text}   ·   ${text}`;

  return (
    <div
      className={`signage-banner signage-banner-${position}`}
      data-testid="signage-banner"
      style={{
        ...drift,
        // CSS custom property drives animation duration without rewrite for static mode
        ['--signage-banner-speed' as string]: `${speed}s`,
      }}
    >
      <div className="signage-banner-track" data-testid="signage-banner-track">
        <span className="signage-banner-text">{marquee}</span>
      </div>
    </div>
  );
}
