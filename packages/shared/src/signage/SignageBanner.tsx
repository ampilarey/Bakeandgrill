import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { activeBanners, normalizeBannerSettings } from './bannerConfig';
import { interpolate } from './interpolate';
import type { SignageBannerItem, SignageBannerSettings, SignagePrayerEntry } from './types';

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
  /** For custom_text interpolation (wifi, phone, etc.). */
  variables?: Record<string, string>;
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
  const normalized = normalizeBannerSettings(banner ?? {});
  if (!normalized.enabled) return false;
  const m = mode ?? 'normal';
  if (m === 'prayer_break' || m.startsWith('emergency:')) return false;
  return activeBanners(normalized).length > 0;
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

function bannerText(
  item: SignageBannerItem,
  opts: {
    dateLabel: string;
    timeLabel: string;
    next: SignagePrayerEntry | null;
    nowMs: number;
    variables: Record<string, string>;
  },
): string {
  const custom = (item.custom_text || '').trim();
  if (custom) {
    return interpolate(custom, {
      ...opts.variables,
      date: opts.dateLabel,
      time: opts.timeLabel,
      today: opts.dateLabel,
      current_time: opts.timeLabel,
      next_prayer: opts.next ? opts.next.name : '',
    });
  }
  const segments = buildBannerSegments({
    fields: item.fields ?? [],
    dateLabel: opts.dateLabel,
    timeLabel: opts.timeLabel,
    next: opts.next,
    nowMs: opts.nowMs,
  });
  if (segments.length > 0) return segments.join('   ·   ');
  return `${opts.dateLabel}   ·   ${opts.timeLabel}`;
}

export function SignageBanner({
  banner,
  schedule,
  nowMs: nowMsProp,
  mode = 'normal',
  burnInOffset,
  dateLabel,
  timeLabel,
  variables = {},
}: SignageBannerProps) {
  const [tick, setTick] = useState(() => Date.now());
  const [bannerIndex, setBannerIndex] = useState(0);

  const normalized = useMemo(() => normalizeBannerSettings(banner), [banner]);
  const enabledList = useMemo(() => activeBanners(normalized), [normalized]);

  useEffect(() => {
    if (nowMsProp != null) return;
    const id = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [nowMsProp]);

  useEffect(() => {
    setBannerIndex(0);
  }, [enabledList.map((b) => b.id).join('|')]);

  useEffect(() => {
    if (enabledList.length <= 1) return;
    const current = enabledList[bannerIndex % enabledList.length];
    const ms = Math.max(5, current?.duration_seconds ?? 30) * 1000;
    const id = window.setTimeout(() => {
      setBannerIndex((i) => (i + 1) % enabledList.length);
    }, ms);
    return () => window.clearTimeout(id);
  }, [enabledList, bannerIndex]);

  const nowMs = nowMsProp ?? tick;
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  if (!shouldShowBanner(normalized, mode) || enabledList.length === 0) return null;

  const active = enabledList[bannerIndex % enabledList.length];
  const next = pickNextPrayer(schedule, nowMs);
  const dLabel = dateLabel ?? defaultDateLabel(now);
  const tLabel = timeLabel ?? defaultTimeLabel(now);
  const text = bannerText(active, {
    dateLabel: dLabel,
    timeLabel: tLabel,
    next,
    nowMs,
    variables,
  });

  const speed = Math.max(10, Math.min(180, Number(active.speed_seconds) || 40));
  const position = active.position === 'top' ? 'top' : 'bottom';
  const drift: CSSProperties = burnInOffset
    ? { transform: `translate(${burnInOffset.x}px, ${burnInOffset.y}px)` }
    : {};

  const marquee = `${text}   ·   ${text}`;

  return (
    <div
      className={`signage-banner signage-banner-${position}`}
      data-testid="signage-banner"
      data-banner-id={active.id}
      data-banner-label={active.label}
      style={{
        ...drift,
        ['--signage-banner-speed' as string]: `${speed}s`,
      }}
    >
      <div className="signage-banner-track" data-testid="signage-banner-track">
        <span className="signage-banner-text">{marquee}</span>
      </div>
    </div>
  );
}
