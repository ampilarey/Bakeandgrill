import { describe, expect, it } from 'vitest';
import {
  AUTO_MENU_ORIGIN,
  activeDaypart,
  applyLayoutToSlides,
  effectiveLayout,
  isAsleep,
  sleepUntilLabel,
  type SignageSlide,
} from '@shared/signage';

/*
 * Day parts and sleep on a screen's look (2026-09-23): breakfast until 11,
 * lunch 11–3, short eats after; black from closing until before opening.
 */

const at = (dow: number, hhmm: string) => {
  // 2026-09-20 is a Sunday.
  const d = new Date(2026, 8, 20 + dow, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
  return d;
};

const dayparts = [
  { id: 'bf', label: 'Breakfast', schedule: { windows: [{ start: '06:00', end: '10:59' }] }, category_ids: [4] },
  { id: 'lunch', label: 'Lunch', schedule: { windows: [{ start: '11:00', end: '14:59' }] }, category_ids: [5], preset: 'photo_grid' },
  { id: 'fri', label: 'Friday tea', schedule: { days: [5], windows: [{ start: '15:00', end: '18:00' }] }, category_ids: [6] },
];

describe('activeDaypart', () => {
  it('picks the window in force, in saved order', () => {
    expect(activeDaypart(dayparts, at(1, '08:30'))?.label).toBe('Breakfast');
    expect(activeDaypart(dayparts, at(1, '12:00'))?.label).toBe('Lunch');
    expect(activeDaypart(dayparts, at(1, '16:00'))).toBeNull();
    expect(activeDaypart(dayparts, at(5, '16:00'))?.label).toBe('Friday tea');
  });

  it('copes with junk', () => {
    expect(activeDaypart(null)).toBeNull();
    expect(activeDaypart([null, 'x', { label: 'Always', category_ids: ['8', 'nope'] }], at(1, '12:00'))).toMatchObject({ label: 'Always', category_ids: [8] });
  });
});

describe('isAsleep', () => {
  const sleep = { enabled: true, off: '23:00', on: '06:45' };

  it('is black overnight and awake in the day', () => {
    expect(isAsleep(sleep, at(1, '23:30'))).toBe(true);
    expect(isAsleep(sleep, at(1, '03:00'))).toBe(true);
    expect(isAsleep(sleep, at(1, '06:44'))).toBe(true);
    expect(isAsleep(sleep, at(1, '06:46'))).toBe(false);
    expect(isAsleep(sleep, at(1, '12:00'))).toBe(false);
  });

  it('honours the day list on the day the window starts', () => {
    const weekend = { ...sleep, days: [5, 6] }; // Fri, Sat nights
    expect(isAsleep(weekend, at(5, '23:30'))).toBe(true);
    expect(isAsleep(weekend, at(6, '03:00'))).toBe(true); // Saturday small hours belong to Friday night
    expect(isAsleep(weekend, at(1, '23:30'))).toBe(false);
    expect(isAsleep({ ...sleep, off: '13:00', on: '15:00', days: [2] }, at(2, '14:00'))).toBe(true);
  });

  it('is never asleep when off, unset or nonsense', () => {
    expect(isAsleep({ ...sleep, enabled: false }, at(1, '23:30'))).toBe(false);
    expect(isAsleep({ enabled: true, off: '', on: '' }, at(1, '23:30'))).toBe(false);
    expect(isAsleep({ enabled: true, off: '23:00', on: '23:00' }, at(1, '23:00'))).toBe(false);
    expect(isAsleep(null)).toBe(false);
  });

  it('labels the wake time', () => {
    expect(sleepUntilLabel(sleep)).toBe('Back at 06:45');
    expect(sleepUntilLabel(null)).toBe('');
  });
});

describe('effectiveLayout', () => {
  const auto: SignageSlide = {
    id: 'auto',
    template_origin: AUTO_MENU_ORIGIN,
    elements: [{ id: 'a', type: 'text', x: 0, y: 0, w: 100, h: 10, binding: { showcase_cap: 12, rows_per_slide: 14 } }],
  };

  it('"Playlist\'s own" with day parts changes only the categories', () => {
    const eff = effectiveLayout({ dayparts }, activeDaypart(dayparts, at(1, '08:30')));
    expect(eff).toEqual({ category_ids: [4] });
    const [out] = applyLayoutToSlides([auto], eff);
    expect(out.elements?.[0].binding).toMatchObject({ showcase_cap: 12, rows_per_slide: 14, category_ids: [4] });
    expect(out.elements?.[0].binding?.preset).toBeUndefined();
  });

  it('a day part with a preset switches the whole look for its window', () => {
    const eff = effectiveLayout({ preset: 'classic', dayparts }, activeDaypart(dayparts, at(1, '12:00')));
    expect(eff).toMatchObject({ preset: 'photo_grid', columns: 3, category_ids: [5] });
  });

  it('is nothing when nothing is set', () => {
    expect(effectiveLayout(null)).toBeNull();
    expect(effectiveLayout({ dayparts }, null)).toBeNull();
  });
});
