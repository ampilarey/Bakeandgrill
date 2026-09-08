import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlanTab, PlanCalendarTab, PlanSettingsTab } from '../pages/ProductionPlanPage';
import { daysFromToday } from '../utils/dateHelpers';
import type { PlanItem, PlanSlotRow, ProductionPlan } from '../api/production-plan';

/*
 * Owner, 2026-09-08: "for Friday evening we will need to make 50 bajiya" —
 * with the month position, school and office holidays, and what registered
 * customers add. The page shows the model's reckoning under a box the
 * kitchen can change, and says where the number came from.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

let manage = true;
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: (slug: string) => (slug === 'kitchen.production.manage' ? manage : true),
    loading: false,
    user: null,
  }),
}));

let mobile = false;
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => !mobile,
}));

const getProductionPlan = vi.fn();
const commitProductionPlan = vi.fn();
const getProductionCalendar = vi.fn();
const createProductionCalendarPeriod = vi.fn();
const getProductionPlanSettings = vi.fn();
const updateProductionPlanSettings = vi.fn();
const updateProductionPlanItem = vi.fn();

vi.mock('../api/production-plan', () => ({
  getProductionPlan: (...a: unknown[]) => getProductionPlan(...a),
  commitProductionPlan: (...a: unknown[]) => commitProductionPlan(...a),
  getProductionCalendar: (...a: unknown[]) => getProductionCalendar(...a),
  createProductionCalendarPeriod: (...a: unknown[]) => createProductionCalendarPeriod(...a),
  updateProductionCalendarPeriod: vi.fn(),
  deleteProductionCalendarPeriod: vi.fn(),
  getProductionPlanSettings: (...a: unknown[]) => getProductionPlanSettings(...a),
  updateProductionPlanSettings: (...a: unknown[]) => updateProductionPlanSettings(...a),
  updateProductionPlanItem: (...a: unknown[]) => updateProductionPlanItem(...a),
  getProductionPlanAccuracy: vi.fn().mockResolvedValue({ weeks: 4, from: '', to: '', days: 0, totals: null, items: [], records: [] }),
  getPlanCustomerHabits: vi.fn(),
}));

const tomorrow = daysFromToday(1);

const slots = [
  { key: '6', label: 'Morning', from: 6, to: 11 },
  { key: '18', label: 'Evening', from: 18, to: 22 },
];

function slotRow(over: Partial<PlanSlotRow>): PlanSlotRow {
  return {
    label: 'Slot', forecast: 0, planned: 0, known: 0, sold_out_days: 0, sample: [],
    saved_planned: null, actual: null, actual_sold_out: null, ...over,
  };
}

const fridays = ['2026-07-17', '2026-07-24', '2026-07-31', '2026-08-07', '2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04'];

const bajiya: PlanItem = {
  key: '7:0', item_id: 7, variant_id: 0, name: 'Bajiya', category: 'Short eats',
  enabled: true, service_level_pct: 85, round_to: 10, min_qty: 0, notes: null,
  factors: {
    day: 0.95,
    month_position: {
      start: { days_seen: 3, learned: 1.2, index: 1.1 },
      mid: { days_seen: 4, learned: 0.9, index: 0.95 },
      end: { days_seen: 5, learned: 1.0, index: 1.0 },
    },
    calendar: { school_holiday: { days_seen: 0, learned: null, expected: 0.8, index: 0.8 } },
    weekday_mean: 60,
  },
  slots: {
    '6': slotRow({ label: 'Morning', forecast: 18.4, planned: 20, sample: fridays.map((date) => ({ date, qty: 18, sold_out: false, sold_out_at: null, kinds: [], position: 'mid', factor: 1, lifted_to: null })) }),
    '18': slotRow({
      label: 'Evening', forecast: 47.3, planned: 50, sold_out_days: 1,
      sample: fridays.map((date, i) => ({
        date, qty: i === 2 ? 20 : 48, sold_out: i === 2, sold_out_at: i === 2 ? '18:30' : null,
        kinds: [], position: 'mid', factor: 1, lifted_to: i === 2 ? 50 : null,
      })),
    }),
  },
  day: { forecast: 65.7, planned: 70, sample_days: 8, last_same_weekday: { date: '2026-09-04', qty: 62 }, known: 0, made: null, actual: null, saved_planned: null },
  customers: { registered_share_pct: 20, buyers: 4, regulars: 1, regulars_weekly_qty: 10, regulars_same_weekday_avg: 9.5 },
};

const water: PlanItem = {
  ...bajiya,
  key: '9:0', item_id: 9, name: 'Water 500ml', category: 'Drinks', enabled: false, round_to: 1,
  slots: { '6': slotRow({ label: 'Morning', forecast: 5, planned: 5 }), '18': slotRow({ label: 'Evening', forecast: 8, planned: 8 }) },
  day: { ...bajiya.day, forecast: 13, planned: 13 },
  customers: { registered_share_pct: null, buyers: 0, regulars: 0, regulars_weekly_qty: 0, regulars_same_weekday_avg: 0 },
};

function plan(over: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    date: tomorrow, weekday: 'Friday', is_today: false, is_past: false,
    month_position: { key: 'mid', label: 'Mid-month (11–20)' },
    calendar: [{ kind: 'school_holiday', label: 'Mid-term break', expected_change_pct: -20 }],
    closed: false, closed_reason: null,
    slots,
    settings: { slots: slots.map(({ label, from, to }) => ({ label, from, to })), lookback_weeks: 12, sample_weeks: 8, default_service_level_pct: 85 },
    history: { from: '2026-06-19', to: '2026-09-10', open_days: 70, enough: true },
    items: [bajiya, water],
    ...over,
  };
}

/*
 * These are the Plan tabs of the Kitchen hub, which draws the title and the
 * tab strip (see HubPage.test.tsx). Each panel is rendered on its own here,
 * the way the hub renders it.
 */
function show() {
  render(<MemoryRouter><PlanTab canManage={manage} /></MemoryRouter>);
}

function showCalendar() {
  render(<MemoryRouter><PlanCalendarTab canManage={manage} /></MemoryRouter>);
}

function showSettings() {
  render(<MemoryRouter><PlanSettingsTab canManage={manage} /></MemoryRouter>);
}

describe('The production plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manage = true;
    mobile = false;
    getProductionPlan.mockResolvedValue(plan());
    commitProductionPlan.mockResolvedValue({ date: tomorrow, saved: 4 });
  });

  it('opens on tomorrow and shows the reckoning under a box the kitchen can change', async () => {
    show();

    const cell = await screen.findByLabelText('Bajiya Evening planned');
    expect(getProductionPlan).toHaveBeenCalledWith(tomorrow);
    expect(within(screen.getByTestId('plan-date')).getByDisplayValue(tomorrow)).toBeInTheDocument();

    // The plan is the box; the model's figure sits under it.
    expect(cell).toHaveValue(50);
    expect(screen.getByTestId('plan-forecast-7:0-18')).toHaveTextContent('≈ 47.3');
    expect(screen.getByTestId('plan-forecast-7:0-18')).toHaveTextContent('sold out 1×');
    expect(screen.getByTestId('plan-day-7:0')).toHaveTextContent('70');

    // What kind of day it is.
    const strip = screen.getByTestId('plan-day-strip');
    expect(strip).toHaveTextContent('Friday');
    expect(strip).toHaveTextContent('mid-month');
    expect(strip).toHaveTextContent('Mid-term break (-20% expected)');
    expect(strip).toHaveTextContent('From 70 trading days');

    // And what the regulars add — as a share and a count, never a name.
    expect(screen.getByTestId('plan-customers-7:0')).toHaveTextContent('20% registered');
    expect(screen.getByTestId('plan-customers-7:0')).toHaveTextContent('1 regular');
  });

  it('saves what the kitchen typed, slot by slot, with the model figure alongside', async () => {
    show();

    const cell = await screen.findByLabelText('Bajiya Evening planned');
    fireEvent.change(cell, { target: { value: '60' } });
    expect(screen.getByTestId('plan-day-7:0')).toHaveTextContent('80');

    fireEvent.click(screen.getByTestId('plan-save'));

    await waitFor(() => expect(commitProductionPlan).toHaveBeenCalledTimes(1));
    const [date, lines] = commitProductionPlan.mock.calls[0] as [string, { item_id: number; slot_start: number; planned_qty: number; forecast_qty: number; slot_label: string }[]];
    expect(date).toBe(tomorrow);
    const evening = lines.find((l) => l.item_id === 7 && l.slot_start === 18);
    expect(evening).toMatchObject({ planned_qty: 60, forecast_qty: 47.3, slot_label: 'Evening' });
    const morning = lines.find((l) => l.item_id === 7 && l.slot_start === 6);
    expect(morning).toMatchObject({ planned_qty: 20 });
    // Hidden items are not part of the plan.
    expect(lines.some((l) => l.item_id === 9)).toBe(false);

    expect(await screen.findByRole('status')).toHaveTextContent('Saved the plan');
    // Reloaded so the saved figures show.
    await waitFor(() => expect(getProductionPlan).toHaveBeenCalledTimes(2));
  });

  it('keeps hidden items out of the way until asked', async () => {
    show();

    await screen.findByLabelText('Bajiya Evening planned');
    expect(screen.queryByText('Water 500ml')).toBeNull();

    fireEvent.click(screen.getByTestId('plan-show-hidden'));
    expect(screen.getByText('Water 500ml')).toBeInTheDocument();
  });

  it('shows the working when asked', async () => {
    show();

    await screen.findByLabelText('Bajiya Evening planned');
    fireEvent.click(screen.getByTestId('plan-evidence-7:0'));

    const working = screen.getByTestId('plan-working-7:0');
    expect(working).toHaveTextContent('Service level 85%');
    expect(working).toHaveTextContent('Batches of 10');
    expect(working).toHaveTextContent('mid-month: -5% (from 4 days)');
    expect(working).toHaveTextContent('Mid-term break: -20% (your expectation — nothing learned yet)');
    expect(working).toHaveTextContent('last 8 Fridays');
    expect(working).toHaveTextContent('20 (ran out 18:30, counted as 50)');
    expect(working).toHaveTextContent('→ ≈ 47.3');
  });

  it('plans nothing for a closed day', async () => {
    getProductionPlan.mockResolvedValue(plan({ closed: true, closed_reason: 'Staff outing', items: [] }));
    show();

    expect(await screen.findByText(/Closed on .* — Staff outing/)).toBeInTheDocument();
    expect(screen.getByTestId('plan-save')).toBeDisabled();
  });

  it('says so when there is not yet enough history', async () => {
    getProductionPlan.mockResolvedValue(plan({ history: { from: '2026-09-01', to: '2026-09-10', open_days: 3, enough: false }, items: [] }));
    show();

    expect(await screen.findByText(/Only 3 trading days of sales so far/)).toBeInTheDocument();
  });

  it('shows what sold when looking back at a day', async () => {
    getProductionPlan.mockResolvedValue(plan({
      is_past: true,
      items: [{
        ...bajiya,
        slots: { ...bajiya.slots, '18': { ...bajiya.slots['18'], actual: 41, actual_sold_out: true, saved_planned: 45 } },
        day: { ...bajiya.day, actual: 59, made: 60, saved_planned: 65 },
      }],
    }));
    show();

    const hint = await screen.findByTestId('plan-forecast-7:0-18');
    expect(hint).toHaveTextContent('sold 41, ran out');
    expect(hint).toHaveTextContent('saved 45');
    // The box opens on what was saved, not on a fresh reckoning.
    expect(screen.getByLabelText('Bajiya Evening planned')).toHaveValue(45);
    expect(screen.getByTestId('plan-day-7:0')).toHaveTextContent('sold 59');
    expect(screen.getByTestId('plan-day-7:0')).toHaveTextContent('made 60');
  });

  it('lays the day out as cards on a phone', async () => {
    mobile = true;
    show();

    const card = await screen.findByTestId('plan-item-7:0');
    expect(within(card).getByText('Evening')).toBeInTheDocument();
    expect(within(card).getByLabelText('Bajiya Evening planned')).toHaveValue(50);
    expect(within(card).getByText('Day:')).toBeInTheDocument();
  });
});

describe('Holidays and closures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manage = true;
    mobile = false;
    getProductionPlan.mockResolvedValue(plan());
    getProductionCalendar.mockResolvedValue({
      from: '2026-08-11', to: '2027-03-09',
      periods: [{
        id: 1, kind: 'public_holiday', kind_label: 'Public holiday', label: 'National day',
        starts_on: '2026-09-11', ends_on: '2026-09-11', days: 1, expected_change_pct: null, notes: null,
      }],
      closures: { '2026-09-20': 'Staff outing' },
      kinds: { public_holiday: 'Public holiday', school_holiday: 'School holiday', office_holiday: 'Office holiday', closed: 'Closed' },
    });
    createProductionCalendarPeriod.mockResolvedValue({ period: { id: 2 } });
  });

  it('lists what is on record and lets a manager add a school holiday with an expectation', async () => {
    showCalendar();

    expect(await screen.findByText('National day')).toBeInTheDocument();
    expect(screen.getByText('Staff outing')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'school_holiday' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mid-term break' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-27' } });
    fireEvent.change(screen.getByLabelText('Expected change (%)'), { target: { value: '-20' } });
    fireEvent.click(screen.getByTestId('calendar-save'));

    await waitFor(() => expect(createProductionCalendarPeriod).toHaveBeenCalledTimes(1));
    expect(createProductionCalendarPeriod).toHaveBeenCalledWith({
      kind: 'school_holiday', label: 'Mid-term break', starts_on: '2026-09-20', ends_on: '2026-09-27',
      expected_change_pct: -20, notes: null,
    });
    // Refreshed after the save.
    await waitFor(() => expect(getProductionCalendar).toHaveBeenCalledTimes(2));
  });

  it('is read-only for the cook', async () => {
    manage = false;
    showCalendar();

    expect(await screen.findByText('National day')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-form')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
  });
});

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    manage = true;
    mobile = false;
    getProductionPlan.mockResolvedValue(plan());
    getProductionPlanSettings.mockResolvedValue({
      settings: plan().settings,
      kinds: {},
      month_positions: {},
    });
    updateProductionPlanSettings.mockImplementation(async (data: Record<string, unknown>) => ({ settings: { ...plan().settings, ...data } }));
    updateProductionPlanItem.mockResolvedValue({ item: {} });
  });

  it('lets a manager change how far back the plan looks', async () => {
    showSettings();

    const lookback = await screen.findByLabelText('Look back (weeks)');
    fireEvent.change(lookback, { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('settings-save'));

    await waitFor(() => expect(updateProductionPlanSettings).toHaveBeenCalledTimes(1));
    expect(updateProductionPlanSettings.mock.calls[0][0]).toMatchObject({ lookback_weeks: 10, sample_weeks: 8, default_service_level_pct: 85 });
    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved.');
  });

  it('saves an item dial', async () => {
    showSettings();

    const tray = await screen.findByLabelText('Bajiya tray of');
    fireEvent.change(tray, { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Save Bajiya dials'));

    await waitFor(() => expect(updateProductionPlanItem).toHaveBeenCalledTimes(1));
    expect(updateProductionPlanItem).toHaveBeenCalledWith(7, {
      variant_id: 0, enabled: true, service_level_pct: 85, round_to: 12, min_qty: 0, notes: null,
    });
  });

  it('is not for the cook', async () => {
    manage = false;
    showSettings();

    expect(await screen.findByText('Only a manager can change how the plan is worked out.')).toBeInTheDocument();
    expect(getProductionPlanSettings).not.toHaveBeenCalled();
  });
});
