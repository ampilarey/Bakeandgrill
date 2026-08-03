import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buildBannerSegments,
  formatCountdown,
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

const enabledBanner: SignageBannerSettings = {
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
};

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
        banner={{
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
        }}
        schedule={[]}
        mode="normal"
        nowMs={Date.parse('2026-08-02T11:00:00+05:00')}
        variables={{ wifi_name: 'BG-Guest', wifi_password: 'secret' }}
      />,
    );
    expect(screen.getByTestId('signage-banner').textContent).toMatch(/Wi-Fi: BG-Guest · secret/);
  });
});
