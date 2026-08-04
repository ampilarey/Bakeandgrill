import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpeningStatusBadge } from './OpeningStatusBadge';

const textMock = vi.fn((_key: string, fallback: string) => fallback);

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'status.open': 'Online ordering open',
        'status.open_closes': 'Online ordering open · Closes {time}',
        'status.closed': 'Online ordering closed',
        'status.closed_opens': 'Online ordering closed · Opens {time}',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({
    text: textMock,
    settings: {},
    trustItems: [],
    heroSlides: [],
    homepageCategories: [],
    proofDetails: [],
    aboutValues: [],
    footerLinks: [],
  }),
}));

describe('OpeningStatusBadge content overrides', () => {
  it('uses i18n when content keys are empty', () => {
    textMock.mockImplementation((_k, fallback) => fallback);
    render(
      <OpeningStatusBadge
        open
        currentClose={new Date().toISOString().replace(/T.*/, 'T21:00:00')}
        timeDisplay="12h"
      />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/Online ordering open · Closes/);
  });

  it('uses content override when present', () => {
    textMock.mockImplementation((key: string, fallback: string) => {
      if (key === 'order_hours_open_closes') return 'Kitchen open · Until {time}';
      return fallback;
    });
    render(
      <OpeningStatusBadge
        open
        currentClose={new Date().toISOString().replace(/T.*/, 'T21:00:00')}
        timeDisplay="12h"
      />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/Kitchen open · Until/);
  });

  it('uses closed_opens override for schedule-closed', () => {
    textMock.mockImplementation((key: string, fallback: string) => {
      if (key === 'order_hours_closed_opens') return 'Shut · Back at {time}';
      return fallback;
    });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    render(
      <OpeningStatusBadge
        open={false}
        reason="schedule"
        nextOpenWindow={tomorrow.toISOString()}
        timeDisplay="12h"
      />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/Shut · Back at/);
  });

  it('shows smaller tomorrow line under closed label when provided', () => {
    textMock.mockImplementation((_k, fallback) => fallback);
    render(
      <OpeningStatusBadge
        open={false}
        reason="schedule"
        tomorrowLine="Some items can be ordered for tomorrow"
      />,
    );
    const badge = screen.getByRole('status');
    expect(badge).toHaveClass('has-tomorrow');
    expect(badge.textContent).toContain('Some items can be ordered for tomorrow');
    expect(badge.querySelector('.opening-status-badge__tomorrow')?.textContent).toBe(
      'Some items can be ordered for tomorrow',
    );
  });

  it('hides tomorrow line when open', () => {
    textMock.mockImplementation((_k, fallback) => fallback);
    render(
      <OpeningStatusBadge
        open
        tomorrowLine="Some items can be ordered for tomorrow"
      />,
    );
    expect(screen.getByRole('status').querySelector('.opening-status-badge__tomorrow')).toBeNull();
  });

  it('does not duplicate tomorrow when already in the closed label', () => {
    textMock.mockImplementation((key: string, fallback: string) => {
      if (key === 'order_hours_closed') {
        return 'Online ordering closed\nSome items can be ordered for tomorrow';
      }
      return fallback;
    });
    render(
      <OpeningStatusBadge
        open={false}
        tomorrowLine="Some items can be ordered for tomorrow"
      />,
    );
    const badge = screen.getByRole('status');
    const matches = badge.textContent?.match(/Some items can be ordered for tomorrow/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(badge.querySelector('.opening-status-badge__main')?.textContent).toBe(
      'Online ordering closed',
    );
  });
});
