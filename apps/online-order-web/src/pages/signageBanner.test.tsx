import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  bannerStyleVars,
  buildBannerSegments,
  formatBannerDate,
  formatCountdown,
  newBannerItem,
  normalizeBannerSettings,
  pickNextPrayer,
  shouldShowBanner,
  SignageBanner,
  type SignageBannerSettings,
  type SignagePrayerEntry,
} from '@shared/signage';

const schedule: SignagePrayerEntry[] = [
  { name: 'Fajr', at: '2026-08-02T05:12:00+05:00' },
  { name: 'Dhuhr', at: '2026-08-02T12:10:00+05:00' },
  { name: 'Asr', at: '2026-08-02T15:30:00+05:00' },
  { name: 'Maghrib', at: '2026-08-02T18:20:00+05:00' },
  { name: 'Isha', at: '2026-08-02T19:40:00+05:00' },
];

const enabledBanner: SignageBannerSettings = normalizeBannerSettings({
  enabled: true,
  banners: [{
    id: 'legacy',
    label: 'Info',
    enabled: true,
    position: 'bottom',
    fields: ['date', 'time', 'next_prayer', 'countdown'],
    speed_seconds: 40,
    duration_seconds: 30,
  }],
});

const legacyShape = {
  enabled: true,
  position: 'bottom' as const,
  fields: ['date', 'time', 'next_prayer', 'countdown'],
  speed_seconds: 40,
};

describe('SignageBanner helpers', () => {
  it('picks the next prayer from the schedule', () => {
    const now = Date.parse('2026-08-02T11:00:00+05:00');
    expect(pickNextPrayer(schedule, now)?.name).toBe('Dhuhr');
  });

  it('rolls to the following prayer once the current one passes', () => {
    const before = Date.parse('2026-08-02T15:29:00+05:00');
    const after = Date.parse('2026-08-02T15:31:00+05:00');
    expect(pickNextPrayer(schedule, before)?.name).toBe('Asr');
    expect(pickNextPrayer(schedule, after)?.name).toBe('Maghrib');
  });

  it('formats countdown at minute granularity', () => {
    expect(formatCountdown(2 * 60 * 60_000 + 14 * 60_000)).toBe('in 2h 14m');
    expect(formatCountdown(45 * 60_000)).toBe('in 45m');
    expect(formatCountdown(30_000)).toBe('in <1m');
    expect(formatCountdown(0)).toBe('now');
  });

  it('falls back to date/time only on an empty schedule', () => {
    const parts = buildBannerSegments({
      fields: ['date', 'time', 'next_prayer', 'countdown'],
      dateLabel: 'Saturday, 2 Aug 2026',
      timeLabel: '1:00 PM',
      next: null,
      nowMs: Date.now(),
    });
    expect(parts).toEqual(['Saturday, 2 Aug 2026', '1:00 PM']);
  });

  it('renders nothing when disabled', () => {
    const { container } = render(
      <SignageBanner
        banner={{ ...enabledBanner, enabled: false }}
        schedule={schedule}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
      />,
    );
    expect(container.querySelector('[data-testid="signage-banner"]')).toBeNull();
  });

  it('shouldShowBanner hides under emergency and prayer_break', () => {
    expect(shouldShowBanner(enabledBanner, 'normal')).toBe(true);
    expect(shouldShowBanner(enabledBanner, 'prayer_break')).toBe(false);
    expect(shouldShowBanner(enabledBanner, 'emergency:closed')).toBe(false);
  });

  it('renders next prayer and countdown under normal mode', () => {
    render(
      <SignageBanner
        banner={enabledBanner}
        schedule={schedule}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        dateLabel="Saturday, 2 Aug 2026"
        timeLabel="11:00 AM"
      />,
    );
    const el = screen.getByTestId('signage-banner');
    expect(el.textContent).toMatch(/Dhuhr/);
    expect(el.textContent).toMatch(/in 1h 10m/);
    expect(el.textContent).toMatch(/Saturday, 2 Aug 2026/);
  });

  it('accepts the Stage-3 single-object banner shape', () => {
    render(
      <SignageBanner
        banner={legacyShape as SignageBannerSettings}
        schedule={schedule}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        dateLabel="Saturday, 2 Aug 2026"
        timeLabel="11:00 AM"
      />,
    );
    expect(screen.getByTestId('signage-banner').textContent).toMatch(/Dhuhr/);
  });

  it('renders custom_text with variables', () => {
    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'wifi',
            label: 'Wi-Fi',
            enabled: true,
            position: 'bottom',
            fields: ['date'],
            custom_text: 'Wi-Fi: {{wifi_name}} · {{wifi_password}}',
            speed_seconds: 40,
            duration_seconds: 20,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        variables={{ wifi_name: 'BG-Guest', wifi_password: 'secret' }}
      />,
    );
    expect(screen.getByTestId('signage-banner').textContent).toMatch(/Wi-Fi: BG-Guest · secret/);
  });

  it('normalises absent appearance fields to legacy defaults', () => {
    const item = normalizeBannerSettings({
      enabled: true,
      position: 'bottom',
      fields: ['date', 'time'],
      speed_seconds: 40,
    }).banners[0];
    expect(item.font_scale).toBe(1);
    expect(item.height_scale).toBe(1);
    expect(item.text_color).toBe('#fff8f0');
    expect(item.background_color).toBe('rgba(12, 8, 4, 0.78)');
    expect(item.align).toBe('left');
    expect(item.scroll_mode).toBe('seamless'); // legacy scroll:true migration
    expect(item.date_format).toBe('full');
    expect(item.inset_percent).toBe(0);
  });

  it('migrates legacy scroll boolean to scroll_mode', () => {
    expect(normalizeBannerSettings({
      enabled: true,
      banners: [{ id: 'a', scroll: true }],
    }).banners[0].scroll_mode).toBe('seamless');
    expect(normalizeBannerSettings({
      enabled: true,
      banners: [{ id: 'b', scroll: false }],
    }).banners[0].scroll_mode).toBe('static');
  });

  it('new banners default to ticker', () => {
    expect(newBannerItem().scroll_mode).toBe('ticker');
  });

  it('emits CSS custom properties from font/height scale', () => {
    const item = normalizeBannerSettings({
      enabled: true,
      banners: [{
        id: 'scaled',
        font_scale: 1.5,
        height_scale: 2,
        speed_seconds: 40,
        inset_percent: 2,
      }],
    }).banners[0];
    const vars = bannerStyleVars(item);
    expect(vars['--signage-banner-font-scale']).toBe('1.5');
    expect(vars['--signage-banner-height-scale']).toBe('2');
    expect(vars['--signage-banner-inset']).toBe('2%');
  });

  it('ticker is a single copy; seamless duplicates; static has no animation class path', () => {
    const text = 'Monday · 12:00';
    const ticker = render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'ticker',
            enabled: true,
            fields: ['date'],
            custom_text: text,
            scroll_mode: 'ticker',
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
      />,
    );
    const tickerEl = ticker.getByTestId('signage-banner');
    expect(tickerEl.getAttribute('data-scroll-mode')).toBe('ticker');
    expect(tickerEl.className).toMatch(/signage-banner--ticker/);
    expect(tickerEl.textContent).toBe(text);
    expect(tickerEl.textContent?.split(text).length - 1).toBe(1);
    ticker.unmount();

    const seamless = render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'seamless',
            enabled: true,
            fields: ['date'],
            custom_text: text,
            scroll_mode: 'seamless',
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
      />,
    );
    const seamlessEl = seamless.getByTestId('signage-banner');
    expect(seamlessEl.getAttribute('data-scroll-mode')).toBe('seamless');
    expect(seamlessEl.textContent?.split(text).length - 1).toBe(2);
    seamless.unmount();

    const staticBanner = render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'static',
            enabled: true,
            position: 'bottom',
            fields: ['date'],
            scroll_mode: 'static',
            align: 'center',
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        dateLabel="Saturday, 2 Aug 2026"
      />,
    );
    const el = staticBanner.getByTestId('signage-banner');
    expect(el.getAttribute('data-scroll-mode')).toBe('static');
    expect(el.className).toMatch(/signage-banner--static/);
    expect(el.style.getPropertyValue('--signage-banner-justify')).toBe('center');
  });

  it('formats each date_format for a fixed date', () => {
    const now = new Date('2026-08-03T12:00:00+05:00');
    expect(formatBannerDate(now, 'full')).toMatch(/Monday/);
    expect(formatBannerDate(now, 'full')).toMatch(/3/);
    expect(formatBannerDate(now, 'full')).toMatch(/Aug/);
    expect(formatBannerDate(now, 'full')).toMatch(/2026/);
    expect(formatBannerDate(now, 'short')).toMatch(/Mon/);
    expect(formatBannerDate(now, 'short')).not.toMatch(/2026/);
    expect(formatBannerDate(now, 'numeric')).toMatch(/03\/08\/2026|3\/8\/2026/);
    expect(formatBannerDate(now, 'weekday')).toBe('Monday');
    const hijri = formatBannerDate(now, 'hijri');
    expect(hijri.length).toBeGreaterThan(0);
    expect(() => formatBannerDate(now, 'hijri')).not.toThrow();
  });

  it('uses per-banner date_format when dateLabel is not overridden', () => {
    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'weekday',
            enabled: true,
            position: 'bottom',
            fields: ['date'],
            date_format: 'weekday',
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-03T12:00:00+05:00')}
        timeLabel="12:00"
      />,
    );
    const el = screen.getByTestId('signage-banner');
    expect(el.getAttribute('data-date-format')).toBe('weekday');
    expect(el.textContent).toMatch(/Monday/);
  });
});
