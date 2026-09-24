import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import { CalendarTab, monthGrid } from '../pages/social/CalendarTab';
import { bestTimesHint } from '../pages/social/composer';
import * as api from '../api';

const entry = (over: Partial<api.SocialCalendarEntry>): api.SocialCalendarEntry => ({
  id: 1, status: 'scheduled', source: 'manual', caption: 'Friday post', image_url: null,
  at: '2026-09-25T18:00:00+05:00', date: '2026-09-25', time: '18:00', platforms: ['facebook'], ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T12:00:00'));
  vi.spyOn(api, 'fetchSocialCalendar').mockResolvedValue({
    posts: [entry({ id: 1 }), entry({ id: 2, status: 'published', caption: 'Went out', date: '2026-09-22', time: '09:15', at: '2026-09-22T09:15:00+05:00' })],
    drafts: [entry({ id: 3, status: 'draft', caption: 'Some day', date: null, time: null, at: null })],
    slots: [{ kind: 'featured', date: '2026-09-25', time: '12:30' }],
    rules: { min_gap_minutes: 0, max_per_day: 0, approval_sms: true, weekly_digest: true },
    best_times: { sample: 2, enough: false, top_hours: [], hours: [], weekdays: [] },
  });
  vi.spyOn(api, 'moveSocialPost').mockResolvedValue({ post: entry({ id: 3, status: 'scheduled', date: '2026-09-28', time: '11:00' }), warning: null });
  vi.spyOn(api, 'updateSocialRules').mockResolvedValue({ rules: { min_gap_minutes: 240, max_per_day: 0, approval_sms: true, weekly_digest: false } });
  vi.spyOn(api, 'fetchSocialPost').mockResolvedValue({ post: {
    id: 1, status: 'scheduled', source: 'manual', source_ref: null, business_date: null, scheduled_at: '2026-09-25T18:00:00+05:00',
    published_at: null, created_at: null, snapshot: { caption: 'Friday post', image_url: null, link_url: null, item_id: null, price: null }, deliveries: [],
  } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('monthGrid', () => {
  it('starts weeks on Sunday and pads to whole weeks', () => {
    const grid = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(grid.slice(0, 3)).toEqual([null, null, '2026-09-01']);
    expect(grid.length % 7).toBe(0);
    expect(grid.filter(Boolean)).toHaveLength(30);
  });
});

describe('bestTimesHint', () => {
  it('says nothing until there is enough data, then names the hours', () => {
    expect(bestTimesHint({ enough: false, top_hours: [], sample: 3 })).toBeNull();
    expect(bestTimesHint({ enough: true, top_hours: [12, 20], sample: 9 })).toBe('Your posts do best around 12:00 and 20:00 (based on 9 posts).');
  });
});

describe('CalendarTab', () => {
  it('shows the month with posts, automation slots and unscheduled drafts, and pages by month', async () => {
    render(<CalendarTab canSchedule canEditRules />);
    expect(await screen.findByTestId('cal-post-1')).toHaveTextContent('18:00 F Friday post');
    expect(api.fetchSocialCalendar).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    expect(screen.getByTestId('cal-month')).toHaveTextContent('September 2026');
    expect(screen.getByTestId('cal-slot-featured-2026-09-25')).toHaveTextContent("12:30 · Chef's pick");
    expect(screen.getByTestId('cal-post-3')).toHaveTextContent('Some day');
    expect(screen.getByText(/Best-time hints appear after 3 more posts/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next month'));
    await waitFor(() => expect(screen.getByTestId('cal-month')).toHaveTextContent('October 2026'));
    expect(api.fetchSocialCalendar).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31');
  });

  it('drags a draft onto a day to schedule it there', async () => {
    render(<CalendarTab canSchedule canEditRules />);
    const draft = await screen.findByTestId('cal-post-3');
    const day = screen.getByTestId('cal-day-2026-09-28');
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => '3') };
    fireEvent.dragStart(draft, { dataTransfer });
    fireEvent.dragOver(day, { dataTransfer });
    fireEvent.drop(day, { dataTransfer });
    await waitFor(() => expect(api.moveSocialPost).toHaveBeenCalledWith(3, '2026-09-28'));
    expect(await screen.findByRole('status')).toHaveTextContent('Moved to 2026-09-28.');
  });

  it('will not drop onto a past day and published posts are not draggable', async () => {
    render(<CalendarTab canSchedule canEditRules />);
    const published = await screen.findByTestId('cal-post-2');
    expect(published).toHaveAttribute('draggable', 'false');
    const draft = screen.getByTestId('cal-post-3');
    const past = screen.getByTestId('cal-day-2026-09-20');
    fireEvent.dragStart(draft, { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(past, { dataTransfer: { getData: vi.fn(() => '3') } });
    expect(api.moveSocialPost).not.toHaveBeenCalled();
  });

  it('saves the posting rules from the selects and opens a post for editing', async () => {
    const onEdit = vi.fn();
    render(<CalendarTab canSchedule canEditRules onEdit={onEdit} />);
    await screen.findByTestId('cal-post-1');
    fireEvent.change(screen.getByLabelText('Minimum gap between posts'), { target: { value: '240' } });
    await waitFor(() => expect(api.updateSocialRules).toHaveBeenCalledWith({ min_gap_minutes: 240 }));
    expect(await screen.findByText(/moved to the next free slot/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cal-post-1'));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 })));
  });

  it('turns the approval SMS and Monday digest on and off from the rules card', async () => {
    render(<CalendarTab canSchedule canEditRules />);
    await screen.findByTestId('cal-post-1');
    const digest = screen.getByLabelText('Monday digest SMS of the social week');
    expect(digest).toBeChecked();
    fireEvent.click(digest);
    await waitFor(() => expect(api.updateSocialRules).toHaveBeenCalledWith({ weekly_digest: false }));
    expect(screen.getByLabelText('Monday digest SMS of the social week')).not.toBeChecked();
    expect(screen.getByLabelText(/SMS me an approve\/reject link/)).toBeChecked();
  });

  it('greys the switches out without the rules permission', async () => {
    render(<CalendarTab canSchedule canEditRules={false} />);
    await screen.findByTestId('cal-post-1');
    expect(screen.getByLabelText('Monday digest SMS of the social week')).toBeDisabled();
  });
});
