import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BANNER_APPEARANCE_DEFAULTS,
  BANNER_SPEED_PRESETS,
  BANNER_SPEED_RANGE,
  bannerStyleVars,
  buildAllPrayersParts,
  buildBannerSegments,
  computeBannerAnimationSeconds,
  fireSignageBannerIteration,
  formatBannerDate,
  formatCountdown,
  newBannerItem,
  normalizeBannerSettings,
  normalizeScrollMode,
  pickNextPrayer,
  shouldShowBanner,
  SignageBanner,
  type SignageBannerSettings,
  type SignagePrayerEntry,
} from '@shared/signage';
// Vite raw import — asserts source consolidation without Node fs typings.
import bannerConfigSrc from '../../../../packages/shared/src/signage/bannerConfig.ts?raw';

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

function fireBannerIteration(track: HTMLElement) {
  act(() => {
    fireSignageBannerIteration(track);
  });
}

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

  it('speed presets include extended range and floor is 5', () => {
    expect(BANNER_SPEED_PRESETS.map((p) => p.label)).toEqual([
      'Very slow', 'Slow', 'Medium', 'Fast', 'Very fast',
    ]);
    expect(BANNER_SPEED_PRESETS.map((p) => p.value)).toEqual([90, 60, 40, 20, 10]);
    expect(BANNER_SPEED_RANGE.min).toBe(5);
    expect(normalizeBannerSettings({
      enabled: true,
      banners: [{ id: 'x', speed_seconds: 5 }],
    }).banners[0].speed_seconds).toBe(5);
    expect(normalizeBannerSettings({
      enabled: true,
      banners: [{ id: 'x', speed_seconds: 4 }],
    }).banners[0].speed_seconds).toBe(5);
  });

  it('measured-width duration keeps visual speed constant across message lengths', () => {
    const speedSeconds = 40;
    const container = 1000;
    const shortTrack = 200;
    const longTrack = 2000;
    const shortDur = computeBannerAnimationSeconds({
      speedSeconds,
      mode: 'ticker',
      containerWidth: container,
      trackWidth: shortTrack,
    });
    const longDur = computeBannerAnimationSeconds({
      speedSeconds,
      mode: 'ticker',
      containerWidth: container,
      trackWidth: longTrack,
    });
    expect(longDur).toBeGreaterThan(shortDur);
    const pxPerSecond = (2 * container) / speedSeconds;
    expect((container + shortTrack) / shortDur).toBeCloseTo(pxPerSecond, 5);
    expect((container + longTrack) / longDur).toBeCloseTo(pxPerSecond, 5);
  });

  it('all_prayers renders five entries and highlights the next one', () => {
    const nowMs = Date.parse('2026-08-02T11:00:00+05:00');
    const next = pickNextPrayer(schedule, nowMs);
    expect(next?.name).toBe('Dhuhr');
    const parts = buildAllPrayersParts(schedule, next);
    expect(parts).toHaveLength(5);
    expect(parts.map((p) => p.name)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
    expect(parts.find((p) => p.isNext)?.name).toBe('Dhuhr');

    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'all',
            fields: ['all_prayers'],
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={schedule}
        mode="normal"
        nowMs={nowMs}
      />,
    );
    expect(screen.getByTestId('signage-banner-all-prayers').textContent).toMatch(/Fajr/);
    expect(screen.getByTestId('signage-banner-all-prayers').textContent).toMatch(/Isha/);
    expect(screen.getByTestId('signage-banner-prayer-next').textContent).toMatch(/Dhuhr/);
  });

  it('all_prayers renders nothing on an empty schedule', () => {
    expect(buildAllPrayersParts([], null)).toEqual([]);
    expect(buildBannerSegments({
      fields: ['all_prayers'],
      dateLabel: 'x',
      timeLabel: 'y',
      next: null,
      nowMs: Date.now(),
      schedule: [],
    })).toEqual([]);

    const { container } = render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'all',
            fields: ['all_prayers'],
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
      />,
    );
    // Falls back to date · time when all field segments are empty.
    expect(container.querySelector('[data-testid="signage-banner-all-prayers"]')).toBeNull();
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

  it('normalises absent appearance fields to product defaults', () => {
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
    expect(item.scroll_mode).toBe(BANNER_APPEARANCE_DEFAULTS.scroll_mode);
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

  it('normalizeScrollMode keeps explicit ticker after migration', () => {
    expect(normalizeScrollMode({ scroll_mode: 'ticker' })).toBe('ticker');
    expect(normalizeScrollMode({ scroll: true, scroll_mode: 'ticker' })).toBe('ticker');
  });

  it('absent scroll_mode defaults to BANNER_APPEARANCE_DEFAULTS.scroll_mode', () => {
    expect(normalizeScrollMode({})).toBe(BANNER_APPEARANCE_DEFAULTS.scroll_mode);
    expect(normalizeBannerSettings({
      enabled: true,
      banners: [{ id: 'legacy-absent' }],
    }).banners[0].scroll_mode).toBe(BANNER_APPEARANCE_DEFAULTS.scroll_mode);
  });

  it('new banners default to BANNER_APPEARANCE_DEFAULTS.scroll_mode', () => {
    expect(newBannerItem().scroll_mode).toBe(BANNER_APPEARANCE_DEFAULTS.scroll_mode);
  });

  it('bannerConfig.ts has no scroll_mode default literal outside BANNER_APPEARANCE_DEFAULTS', () => {
    const withoutDefaults = bannerConfigSrc.replace(
      /export const BANNER_APPEARANCE_DEFAULTS = \{[\s\S]*?\n\};/,
      'export const BANNER_APPEARANCE_DEFAULTS = {};',
    );
    expect(withoutDefaults).not.toMatch(/scroll_mode:\s*'ticker'/);
    expect(withoutDefaults).not.toMatch(/return\s+'ticker'/);
    expect(BANNER_APPEARANCE_DEFAULTS.scroll_mode).toBe('ticker');
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
    expect(tickerEl.className).toMatch(/signage-banner--ltr/);
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

  it('advances after repeat_count animation iterations without setTimeout rotation', () => {
    const timeoutSpy = vi.spyOn(window, 'setTimeout');
    const advances: Array<{ fromId: string; toId: string; viaLogo: boolean }> = [];
    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [
            {
              id: 'a',
              enabled: true,
              custom_text: 'Banner A',
              scroll_mode: 'ticker',
              repeat_count: 3,
              speed_seconds: 40,
              duration_seconds: 30,
            },
            {
              id: 'b',
              enabled: true,
              custom_text: 'Banner B',
              scroll_mode: 'ticker',
              repeat_count: 1,
              speed_seconds: 40,
              duration_seconds: 30,
            },
          ],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        onAdvance={(info) => advances.push(info)}
      />,
    );
    const track = screen.getByTestId('signage-banner-track');
    expect(screen.getByTestId('signage-banner').getAttribute('data-banner-id')).toBe('a');
    fireBannerIteration(track);
    fireBannerIteration(track);
    expect(screen.getByTestId('signage-banner').getAttribute('data-banner-id')).toBe('a');
    fireBannerIteration(track);
    expect(screen.getByTestId('signage-banner').getAttribute('data-banner-id')).toBe('b');
    expect(advances).toHaveLength(1);
    expect(advances[0]).toEqual({ fromId: 'a', toId: 'b', viaLogo: false });
    const rotationTimeouts = timeoutSpy.mock.calls.filter(
      ([, delay]) => typeof delay === 'number' && delay >= 5000,
    );
    expect(rotationTimeouts).toHaveLength(0);
    timeoutSpy.mockRestore();
  });

  it('RTL sets dir and lang; only one direction visible after advance', async () => {
    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [
            {
              id: 'en',
              enabled: true,
              custom_text: 'English',
              direction: 'ltr',
              scroll_mode: 'ticker',
              repeat_count: 1,
              speed_seconds: 40,
              duration_seconds: 30,
            },
            {
              id: 'dv',
              enabled: true,
              custom_text: 'ދިވެހި',
              direction: 'rtl',
              scroll_mode: 'ticker',
              repeat_count: 1,
              speed_seconds: 40,
              duration_seconds: 30,
            },
          ],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
      />,
    );
    const text = screen.getByTestId('signage-banner-text');
    expect(text.getAttribute('dir')).toBe('ltr');
    expect(text.getAttribute('lang')).toBeNull();
    expect(screen.getByTestId('signage-banner').getAttribute('data-direction')).toBe('ltr');
    fireBannerIteration(screen.getByTestId('signage-banner-track'));
    await waitFor(() => {
      expect(screen.getByTestId('signage-banner-text').getAttribute('dir')).toBe('rtl');
    });
    const rtlText = screen.getByTestId('signage-banner-text');
    expect(rtlText.getAttribute('dir')).toBe('rtl');
    expect(rtlText.getAttribute('lang')).toBe('dv');
    // Thaana comes from fonts.css [lang=dv]/[dir=rtl] — no per-element fontFamily.
    expect(rtlText.style.fontFamily).toBe('');
    expect(screen.getByTestId('signage-banner').getAttribute('data-direction')).toBe('rtl');
    expect(screen.queryAllByTestId('signage-banner-text')).toHaveLength(1);
  });

  it('shows logo phase between banners when configured', async () => {
    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          show_logo_between: true,
          banners: [
            {
              id: 'a',
              enabled: true,
              custom_text: 'A',
              scroll_mode: 'ticker',
              repeat_count: 1,
              speed_seconds: 40,
              duration_seconds: 30,
            },
            {
              id: 'b',
              enabled: true,
              custom_text: 'B',
              scroll_mode: 'ticker',
              repeat_count: 1,
              speed_seconds: 40,
              duration_seconds: 30,
            },
          ],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        logoUrl="/logo.png"
      />,
    );
    fireBannerIteration(screen.getByTestId('signage-banner-track'));
    await waitFor(() => {
      expect(screen.getByTestId('signage-banner').getAttribute('data-phase')).toBe('logo');
    });
    expect(screen.getByTestId('signage-banner-logo')).toBeTruthy();
  });

  it('skips logo phase with a single enabled banner', () => {
    render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          show_logo_between: true,
          banners: [{
            id: 'solo',
            enabled: true,
            custom_text: 'Only one',
            scroll_mode: 'ticker',
            repeat_count: 1,
            speed_seconds: 40,
            duration_seconds: 30,
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        logoUrl="/logo.png"
      />,
    );
    fireBannerIteration(screen.getByTestId('signage-banner-track'));
    expect(screen.queryByTestId('signage-banner-logo')).toBeNull();
    expect(screen.getByTestId('signage-banner').getAttribute('data-phase')).toBe('banner');
  });

  it('hides banner outside its schedule window', () => {
    const { container } = render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'weekday-only',
            enabled: true,
            fields: ['date'],
            scroll_mode: 'static',
            speed_seconds: 40,
            duration_seconds: 30,
            schedule: {
              days: [1], // Monday only
              windows: [{ start: '00:00', end: '23:59' }],
            },
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-03T12:00:00+05:00')} // Monday in +05
      />,
    );
    expect(container.querySelector('[data-testid="signage-banner"]')).toBeTruthy();

    const { container: offDay } = render(
      <SignageBanner
        banner={normalizeBannerSettings({
          enabled: true,
          banners: [{
            id: 'weekday-only',
            enabled: true,
            fields: ['date'],
            scroll_mode: 'static',
            speed_seconds: 40,
            duration_seconds: 30,
            schedule: {
              days: [2], // Tuesday only
              windows: [{ start: '00:00', end: '23:59' }],
            },
          }],
        })}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-03T12:00:00+05:00')} // Monday
      />,
    );
    expect(offDay.querySelector('[data-testid="signage-banner"]')).toBeNull();
  });
});
