import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  activeBanners,
  BANNER_APPEARANCE_DEFAULTS,
  BANNER_SPEED_RANGE,
  clampSpeed,
  normalizeBannerSettings,
} from './bannerConfig';
import { interpolate } from './interpolate';
import type {
  SignageBannerDateFormat,
  SignageBannerDirection,
  SignageBannerItem,
  SignageBannerScrollMode,
  SignageBannerSettings,
  SignagePrayerEntry,
} from './types';

/** Pinned so two TVs from different suppliers render the same date strings. */
export const SIGNAGE_BANNER_LOCALE = 'en-GB';

/**
 * @deprecated Prefer `lang="dv"` / `dir="rtl"` — shared fonts.css applies
 * `var(--font-dhivehi)` automatically. Kept for callers that still read the stack.
 */
export const SIGNAGE_BANNER_THAANA_FONT = 'var(--font-dhivehi)';

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
  /** Brand logo for the between-banner separator (`logo_dark ?? logo`). */
  logoUrl?: string | null;
  /**
   * Test hook: when set, force this many animation iterations before asserting.
   * Production always drives from real animation events.
   */
  onAdvance?: (info: { fromId: string; toId: string; viaLogo: boolean }) => void;
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

/**
 * Visibility gate used by the player and the banner itself.
 * Pass `now` whenever a clock is available (preview, injected nowMs, tests);
 * omit it to evaluate against wall-clock time (legacy callers).
 */
export function shouldShowBanner(
  banner: SignageBannerSettings | null | undefined,
  mode?: string,
  now: Date = new Date(),
): boolean {
  const normalized = normalizeBannerSettings(banner ?? {});
  if (!normalized.enabled) return false;
  const m = mode ?? 'normal';
  if (m === 'prayer_break' || m.startsWith('emergency:')) return false;
  return activeBanners(normalized, now).length > 0;
}

function formatGregorian(now: Date, opts: Intl.DateTimeFormatOptions): string {
  return now.toLocaleDateString(SIGNAGE_BANNER_LOCALE, opts);
}

function formatHijri(now: Date): string {
  try {
    const formatted = new Intl.DateTimeFormat(SIGNAGE_BANNER_LOCALE, {
      calendar: 'islamic-umalqura',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
    if (formatted && formatted.trim()) return formatted;
  } catch {
    /* calendar unsupported */
  }
  return formatGregorian(now, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatBannerDate(
  now: Date,
  format: SignageBannerDateFormat | string = 'full',
): string {
  switch (format) {
    case 'short':
      return formatGregorian(now, { weekday: 'short', day: 'numeric', month: 'short' });
    case 'numeric':
      return formatGregorian(now, { day: '2-digit', month: '2-digit', year: 'numeric' });
    case 'weekday':
      return formatGregorian(now, { weekday: 'long' });
    case 'hijri':
      return formatHijri(now);
    case 'full':
    default:
      return formatGregorian(now, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
  }
}

function defaultTimeLabel(now: Date): string {
  return now.toLocaleTimeString(SIGNAGE_BANNER_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type AllPrayerPart = {
  name: string;
  time: string;
  isNext: boolean;
};

export function formatPrayerClock(atIso: string): string {
  const ms = Date.parse(atIso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString(SIGNAGE_BANNER_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Full-day prayer list for the `all_prayers` field. Empty schedule → []. */
export function buildAllPrayersParts(
  schedule: SignagePrayerEntry[],
  next: SignagePrayerEntry | null,
): AllPrayerPart[] {
  if (!schedule.length) return [];
  return schedule.map((entry) => ({
    name: entry.name,
    time: formatPrayerClock(entry.at),
    isNext: Boolean(next && next.name === entry.name && next.at === entry.at),
  }));
}

export function buildBannerSegments(opts: {
  fields: string[];
  dateLabel: string;
  timeLabel: string;
  next: SignagePrayerEntry | null;
  nowMs: number;
  schedule?: SignagePrayerEntry[];
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
    } else if (field === 'all_prayers') {
      const prayerParts = buildAllPrayersParts(opts.schedule ?? [], opts.next);
      if (prayerParts.length > 0) {
        parts.push(prayerParts.map((p) => `${p.name} ${p.time}`).join(' · '));
      }
    }
  }
  return parts.filter(Boolean);
}

/**
 * Derive animation duration so visual travel speed stays constant across
 * message lengths. `speed_seconds` keeps its stored meaning as the legacy
 * "two viewport widths" reference time.
 */
export function computeBannerAnimationSeconds(opts: {
  speedSeconds: number;
  mode: SignageBannerScrollMode | string;
  containerWidth: number;
  trackWidth: number;
}): number {
  const speed = clampSpeed(opts.speedSeconds);
  if (opts.mode === 'static') return speed;
  const container = Math.max(1, opts.containerWidth);
  const track = Math.max(1, opts.trackWidth);
  // Legacy ticker travelled 2× viewport in `speed` seconds.
  const pxPerSecond = (2 * container) / speed;
  if (opts.mode === 'seamless') {
    // Marquee keyframes move -50% of a duplicated track (= one copy).
    return Math.max(2, (track / 2) / pxPerSecond);
  }
  // Ticker: enter from off-screen and fully clear (= container + content).
  return Math.max(2, (container + track) / pxPerSecond);
}

function bannerText(
  item: SignageBannerItem,
  opts: {
    dateLabel: string;
    timeLabel: string;
    next: SignagePrayerEntry | null;
    nowMs: number;
    variables: Record<string, string>;
    schedule: SignagePrayerEntry[];
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
    schedule: opts.schedule,
  });
  if (segments.length > 0) return segments.join('   ·   ');
  return `${opts.dateLabel}   ·   ${opts.timeLabel}`;
}

function renderFieldContent(opts: {
  fields: string[];
  dateLabel: string;
  timeLabel: string;
  next: SignagePrayerEntry | null;
  nowMs: number;
  schedule: SignagePrayerEntry[];
}): ReactNode {
  const fields = opts.fields.length > 0
    ? opts.fields
    : ['date', 'time', 'next_prayer', 'countdown'];
  const nodes: ReactNode[] = [];
  let sep = 0;
  const pushSep = () => {
    if (nodes.length > 0) {
      nodes.push(
        <span key={`sep-${sep++}`} className="signage-banner-sep">
          {'   ·   '}
        </span>,
      );
    }
  };

  for (const field of fields) {
    if (field === 'date') {
      pushSep();
      nodes.push(<span key={`date-${sep}`}>{opts.dateLabel}</span>);
    } else if (field === 'time') {
      pushSep();
      nodes.push(<span key={`time-${sep}`}>{opts.timeLabel}</span>);
    } else if (field === 'next_prayer') {
      if (opts.next) {
        pushSep();
        nodes.push(<span key={`next-${sep}`}>{`Next prayer · ${opts.next.name}`}</span>);
      }
    } else if (field === 'countdown') {
      if (opts.next) {
        const at = Date.parse(opts.next.at);
        if (Number.isFinite(at)) {
          pushSep();
          nodes.push(<span key={`cd-${sep}`}>{formatCountdown(at - opts.nowMs)}</span>);
        }
      }
    } else if (field === 'all_prayers') {
      const parts = buildAllPrayersParts(opts.schedule, opts.next);
      if (parts.length === 0) continue;
      pushSep();
      nodes.push(
        <span key={`all-${sep}`} className="signage-banner-all-prayers" data-testid="signage-banner-all-prayers">
          {parts.map((p, i) => (
            <span key={`${p.name}-${p.time}`}>
              {i > 0 ? ' · ' : ''}
              <span
                className={p.isNext ? 'signage-banner-prayer-next' : undefined}
                data-testid={p.isNext ? 'signage-banner-prayer-next' : undefined}
                data-prayer={p.name}
              >
                {p.name} {p.time}
              </span>
            </span>
          ))}
        </span>,
      );
    }
  }

  if (nodes.length === 0) {
    return `${opts.dateLabel}   ·   ${opts.timeLabel}`;
  }
  return nodes;
}

function justifyForAlign(align: string): string {
  if (align === 'center') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
}

export function bannerStyleVars(
  item: SignageBannerItem,
  extras: Record<string, string> = {},
): Record<string, string> {
  const fontScale = Number(item.font_scale) || BANNER_APPEARANCE_DEFAULTS.font_scale;
  const heightScale = Number(item.height_scale) || BANNER_APPEARANCE_DEFAULTS.height_scale;
  const inset = Math.max(0, Math.min(5, Number(item.inset_percent) || 0));
  const repeats = Math.max(1, Math.min(20, Number(item.repeat_count) || 1));
  const speed = clampSpeed(item.speed_seconds);
  return {
    '--signage-banner-speed': `${speed}s`,
    '--signage-banner-font-scale': String(fontScale),
    '--signage-banner-height-scale': String(heightScale),
    '--signage-banner-color': item.text_color || BANNER_APPEARANCE_DEFAULTS.text_color,
    '--signage-banner-bg': item.background_color || BANNER_APPEARANCE_DEFAULTS.background_color,
    '--signage-banner-justify': justifyForAlign(item.align || 'left'),
    '--signage-banner-inset': `${inset}%`,
    '--signage-banner-repeats': String(repeats),
    ...extras,
  };
}

export function resolveBannerScrollMode(
  item: SignageBannerItem | { scroll_mode?: string; scroll?: boolean },
): SignageBannerScrollMode {
  const mode = String((item as SignageBannerItem).scroll_mode || '');
  if (mode === 'ticker' || mode === 'seamless' || mode === 'static') return mode;
  if ('scroll' in item && (item as { scroll?: boolean }).scroll === false) return 'static';
  if ('scroll' in item && (item as { scroll?: boolean }).scroll === true) return 'seamless';
  return BANNER_APPEARANCE_DEFAULTS.scroll_mode;
}

export function resolveBannerDirection(
  item: SignageBannerItem | { direction?: string },
): SignageBannerDirection {
  return item.direction === 'rtl' ? 'rtl' : 'ltr';
}

type Phase = 'banner' | 'logo';

/** jsdom cannot dispatch animationiteration; tests call this on the track node. */
export const SIGNAGE_BANNER_TEST_ITERATION = 'signage-banner-test-iteration';
export const SIGNAGE_BANNER_TEST_LOGO_END = 'signage-banner-test-logo-end';

export function fireSignageBannerIteration(track: HTMLElement) {
  const tick = (track as HTMLElement & { __signageTick?: () => void }).__signageTick;
  if (tick) tick();
}

export function fireSignageBannerLogoEnd(logoHold: HTMLElement) {
  const end = (logoHold as HTMLElement & { __signageLogoEnd?: () => void }).__signageLogoEnd;
  if (end) end();
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
  logoUrl,
  onAdvance,
}: SignageBannerProps) {
  const [tick, setTick] = useState(() => Date.now());
  const [bannerIndex, setBannerIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('banner');
  const [passCount, setPassCount] = useState(0);
  const [motionVars, setMotionVars] = useState<Record<string, string>>({});
  const passCountRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const normalized = useMemo(() => normalizeBannerSettings(banner), [banner]);
  const nowMs = nowMsProp ?? tick;
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const enabledList = useMemo(() => activeBanners(normalized, now), [normalized, now]);
  const enabledKey = enabledList.map((b) => b.id).join('|');

  useEffect(() => {
    if (nowMsProp != null) return;
    const id = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [nowMsProp]);

  useEffect(() => {
    setBannerIndex(0);
    setPhase('banner');
    setPassCount(0);
    passCountRef.current = 0;
  }, [enabledKey]);

  const showBanner = shouldShowBanner(normalized, mode, now) && enabledList.length > 0;
  const showLogoBetween = Boolean(normalized.show_logo_between) && enabledList.length > 1 && Boolean(logoUrl);
  const active = showBanner ? enabledList[bannerIndex % enabledList.length] : null;
  const next = pickNextPrayer(schedule, nowMs);
  const scrollMode = active ? resolveBannerScrollMode(active) : BANNER_APPEARANCE_DEFAULTS.scroll_mode;
  const direction = active ? resolveBannerDirection(active) : 'ltr';
  const customText = (active?.custom_text || '').trim();
  const dLabel = active
    ? (dateLabel ?? formatBannerDate(now, active.date_format || 'full'))
    : '';
  const tLabel = active ? (timeLabel ?? defaultTimeLabel(now)) : '';
  const plainText = active
    ? bannerText(active, {
      dateLabel: dLabel,
      timeLabel: tLabel,
      next,
      nowMs,
      variables,
      schedule,
    })
    : '';
  const richContent = active && !customText
    ? renderFieldContent({
      fields: active.fields ?? [],
      dateLabel: dLabel,
      timeLabel: tLabel,
      next,
      nowMs,
      schedule,
    })
    : null;
  const contentNode: ReactNode = customText
    ? plainText
    : richContent;
  const seamlessNode: ReactNode = scrollMode === 'seamless'
    ? (
      <>
        <span className="signage-banner-text" data-testid="signage-banner-text">
          {contentNode}
        </span>
        <span className="signage-banner-sep" aria-hidden>
          {'   ·   '}
        </span>
        <span className="signage-banner-text" aria-hidden>
          {contentNode}
        </span>
      </>
    )
    : (
      <span
        className="signage-banner-text"
        data-testid="signage-banner-text"
        dir={direction === 'rtl' ? 'rtl' : 'ltr'}
        lang={direction === 'rtl' ? 'dv' : undefined}
      >
        {contentNode}
      </span>
    );

  useLayoutEffect(() => {
    if (!showBanner || !active || phase !== 'banner') return;
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    const apply = () => {
      const containerWidth = root.clientWidth || 0;
      const trackWidth = track.scrollWidth || 0;
      if (containerWidth <= 0 || trackWidth <= 0) {
        // jsdom / first paint — keep stored speed_seconds as duration.
        setMotionVars({
          '--signage-banner-speed': `${clampSpeed(active.speed_seconds)}s`,
        });
        return;
      }
      const duration = computeBannerAnimationSeconds({
        speedSeconds: active.speed_seconds,
        mode: scrollMode,
        containerWidth,
        trackWidth,
      });
      const nextVars: Record<string, string> = {
        '--signage-banner-speed': `${duration}s`,
      };
      if (scrollMode === 'ticker') {
        if (direction === 'rtl') {
          nextVars['--signage-banner-ticker-from'] = `${-containerWidth}px`;
          nextVars['--signage-banner-ticker-to'] = `${trackWidth}px`;
        } else {
          nextVars['--signage-banner-ticker-from'] = `${containerWidth}px`;
          nextVars['--signage-banner-ticker-to'] = `${-trackWidth}px`;
        }
      }
      setMotionVars(nextVars);
    };

    apply();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => apply())
      : null;
    ro?.observe(root);
    ro?.observe(track);
    return () => ro?.disconnect();
  }, [
    showBanner,
    active?.id,
    active?.speed_seconds,
    active?.fields,
    active?.custom_text,
    plainText,
    scrollMode,
    direction,
    phase,
    bannerIndex,
  ]);

  // No setTimeout rotation — advancement is driven only by animation events below.

  if (!showBanner || !active) return null;

  const position = active.position === 'top' ? 'top' : 'bottom';
  const repeatCount = Math.max(1, Math.min(20, Number(active.repeat_count) || 1));
  const drift: CSSProperties = burnInOffset
    ? { transform: `translate(${burnInOffset.x}px, ${burnInOffset.y}px)` }
    : {};
  const vars = bannerStyleVars(active, motionVars);

  const advanceFrom = (fromId: string) => {
    if (enabledList.length <= 1) {
      passCountRef.current = 0;
      setPassCount(0);
      return;
    }
    const nextIndex = (bannerIndex + 1) % enabledList.length;
    const toId = enabledList[nextIndex]?.id ?? fromId;
    if (showLogoBetween) {
      setPhase('logo');
      passCountRef.current = 0;
      setPassCount(0);
      onAdvance?.({ fromId, toId, viaLogo: true });
      return;
    }
    setBannerIndex(nextIndex);
    passCountRef.current = 0;
    setPassCount(0);
    onAdvance?.({ fromId, toId, viaLogo: false });
  };

  const onTrackAnimationIteration = () => {
    if (phase !== 'banner') return;
    if (scrollMode === 'static') return; // static uses animationend after N holds
    const nextPass = passCountRef.current + 1;
    passCountRef.current = nextPass;
    setPassCount(nextPass);
    if (nextPass >= repeatCount) {
      advanceFrom(active.id);
    }
  };

  const onTrackAnimationEnd = (e?: AnimationEvent<HTMLDivElement>) => {
    if (e && e.currentTarget !== e.target) return;
    if (phase === 'logo') {
      const fromId = active.id;
      const nextIndex = (bannerIndex + 1) % enabledList.length;
      setBannerIndex(nextIndex);
      setPhase('banner');
      passCountRef.current = 0;
      setPassCount(0);
      onAdvance?.({ fromId, toId: enabledList[nextIndex]?.id ?? fromId, viaLogo: true });
      return;
    }
    if (scrollMode === 'static') {
      // One-shot (or N-iteration) hold finished — advance.
      advanceFrom(active.id);
    }
  };

  const dirClass = direction === 'rtl' ? ' signage-banner--rtl' : ' signage-banner--ltr';
  const phaseClass = phase === 'logo' ? ' signage-banner--logo' : ` signage-banner--${scrollMode}`;

  return (
    <div
      ref={rootRef}
      className={`signage-banner signage-banner-${position}${phaseClass}${dirClass}`}
      data-testid="signage-banner"
      data-banner-id={phase === 'banner' ? active.id : 'logo'}
      data-banner-label={phase === 'banner' ? active.label : 'logo'}
      data-scroll-mode={scrollMode}
      data-direction={direction}
      data-phase={phase}
      data-pass-count={passCount}
      data-date-format={active.date_format || 'full'}
      data-speed-seconds={clampSpeed(active.speed_seconds)}
      style={{
        ...drift,
        ...vars,
      }}
    >
      {phase === 'logo' ? (
        <div
          className="signage-banner-logo-hold"
          data-testid="signage-banner-logo"
          onAnimationEnd={onTrackAnimationEnd}
          ref={(el) => {
            if (el) (el as HTMLElement & { __signageLogoEnd?: () => void }).__signageLogoEnd = () => onTrackAnimationEnd();
          }}
        >
          <img src={logoUrl || ''} alt="" className="signage-banner-logo-img" />
        </div>
      ) : (
        <div
          className="signage-banner-track"
          data-testid="signage-banner-track"
          onAnimationIteration={onTrackAnimationIteration}
          onAnimationEnd={onTrackAnimationEnd}
          ref={(el) => {
            trackRef.current = el;
            if (el) (el as HTMLElement & { __signageTick?: () => void }).__signageTick = onTrackAnimationIteration;
          }}
        >
          {seamlessNode}
        </div>
      )}
    </div>
  );
}

// Re-export for callers that need the clamp range without importing bannerConfig.
export { BANNER_SPEED_RANGE };
