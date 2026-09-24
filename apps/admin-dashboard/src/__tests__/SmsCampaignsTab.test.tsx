import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render, within } from '@testing-library/react';
import { CampaignsTab } from '../pages/SmsPage/CampaignsTab';
import * as api from '../api';

/*
 * SMS audit, 2026-09-24: a campaign audience is built from what customers
 * bought; recipes fill the form; the audience can be saved; "send a test
 * to me" texts the signed-in user the exact message.
 */

const categories: api.MenuCategory[] = [
  { id: 1, name: 'Grill', is_active: true, items: [{ id: 11, name: 'Chicken burger' } as api.MenuItem, { id: 12, name: 'Chicken wrap' } as api.MenuItem] },
  { id: 2, name: 'Bakery', is_active: true, items: [{ id: 21, name: 'Croissant' } as api.MenuItem] },
];

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchSmsCampaigns').mockResolvedValue({
    data: [{
      id: 5, name: 'Delivery push', message: 'Hi {name}, free delivery', status: 'draft', total_recipients: 0, sent_count: 0, failed_count: 0,
      total_cost_mvr: '0.00', created_at: '2026-09-24T10:00:00+05:00', audience_summary: 'Delivery in the last 90 days',
    }, {
      id: 6, name: 'Eid deal', message: 'Eid deal', status: 'completed', total_recipients: 40, sent_count: 40, failed_count: 0,
      total_cost_mvr: '10.00', created_at: '2026-09-20T10:00:00+05:00', audience_summary: 'All SMS opt-in customers',
      results: { window_days: 7, buyers: 5, orders: 6, revenue_mvr: 812.5, buyer_rate: 12.5, reached: 40, complete: false },
    }],
  });
  vi.spyOn(api, 'fetchSmsCampaignRecipes').mockResolvedValue({
    recipes: [
      { key: 'win_back', label: 'Win-back offer', description: 'Two months away.', needs: null, criteria: { dormant_days: 60 }, message: 'Hi {name}, we saved you a seat.' },
      { key: 'new_dish_for_fans', label: 'New dish for fans of…', description: 'Fans of a dish.', needs: 'item', criteria: { likes_item_id: null, window_days: 90 }, message: 'Hi {name}, new dish!' },
    ],
    order_types: { dine_in: 'Dine-in', takeaway: 'Takeaway', online_pickup: 'Online pickup', delivery: 'Delivery' },
    segments: [{ slug: 'vip_customers', label: 'VIP customers' }, { slug: 'no_order_yet', label: 'No paid orders yet' }],
  });
  vi.spyOn(api, 'fetchSmsAudiences').mockResolvedValue({
    audiences: [{ id: 3, name: 'Delivery regulars', criteria: { order_types: ['delivery'] }, summary: 'Delivery in the last 90 days', count: 42 }],
    order_types: {},
  });
  vi.spyOn(api, 'fetchAdminCategories').mockResolvedValue({ data: categories });
  vi.spyOn(api, 'previewSmsCampaign').mockResolvedValue({
    recipient_count: 7, total_cost_mvr: '1.75', audience_summary: 'Likes Chicken burger in the last 90 days · Spent MVR 500+',
    daily_cap: { cap: 5000, used_24h: 4996, remaining: 4, blocked: true },
    sample_recipients: [{ name: 'Aisha', phone: '+9607000001', tier: 'gold' }],
  });
  vi.spyOn(api, 'createSmsCampaign').mockResolvedValue({ campaign: { id: 9 } as api.SmsCampaign });
  vi.spyOn(api, 'createSmsAudience').mockResolvedValue({ audience: { id: 4, name: 'Burger fans', criteria: {}, summary: 'x', count: 7 } });
  vi.spyOn(api, 'testSendSmsCampaign').mockResolvedValue({ ok: true, message: 'Test sent to +9607779999.', results: [] });
  vi.spyOn(api, 'fetchSmsCampaignSchedules').mockResolvedValue({ schedules: [{
    id: 2, name: 'We miss you', message: 'Hi {name}', target_criteria: { dormant_days: 30 }, audience_summary: 'No order for 30+ days',
    frequency: 'weekly', days_of_week: ['mon'], send_time: '10:00', schedule_summary: 'Every Mon at 10:00', cooldown_days: 30, is_active: true,
    next_run_at: '2026-09-28T05:00:00Z', last_run_at: '2026-09-21T05:00:00Z', runs_count: 1, campaigns_count: 1,
    last_campaign: { id: 4, status: 'completed', total_recipients: 12, results: { window_days: 7, buyers: 2, orders: 2, revenue_mvr: 240, buyer_rate: 16.7, reached: 12, complete: false } },
  }] });
  vi.spyOn(api, 'createSmsCampaignSchedule').mockImplementation(async (d) => ({ schedule: {
    id: 3, name: d.name, message: d.message, target_criteria: d.target_criteria ?? {}, audience_summary: 'x', frequency: d.frequency, days_of_week: d.days_of_week ?? null,
    day_of_month: d.day_of_month ?? null, send_time: d.send_time, schedule_summary: 'Every Thu and Sat at 18:30', cooldown_days: d.cooldown_days ?? 30, is_active: true,
    next_run_at: null, last_run_at: null, runs_count: 0, campaigns_count: 0, last_campaign: null,
  } }));
  vi.spyOn(api, 'updateSmsCampaignSchedule').mockImplementation(async (id, d) => ({ schedule: {
    id, name: 'We miss you', message: 'Hi {name}', target_criteria: {}, audience_summary: 'x', frequency: 'weekly', send_time: '10:00', schedule_summary: 'Every Mon at 10:00',
    cooldown_days: 30, is_active: d.is_active ?? true, next_run_at: null, last_run_at: null, runs_count: 1, campaigns_count: 1, last_campaign: null,
  } }));
  vi.spyOn(api, 'runSmsCampaignSchedule').mockResolvedValue({ campaign: { id: 9 } as api.SmsCampaign, message: 'Sent to 3 recipients.' });
});

async function openForm() {
  render(<CampaignsTab />);
  await screen.findByTestId('campaign-5');
  fireEvent.click(screen.getByText('+ New Campaign'));
  await screen.findByTestId('audience-builder');
}

describe('SMS CampaignsTab — purchase-based targeting', () => {
  it('lists campaigns with their audience and results, opens the log, and offers a test send from the row', async () => {
    const onViewLog = vi.fn();
    render(<CampaignsTab onViewLog={onViewLog} />);
    const row = await screen.findByTestId('campaign-5');
    expect(row).toHaveTextContent('Delivery in the last 90 days');
    expect(screen.getByTestId('campaign-results-5')).toHaveTextContent('—');
    expect(screen.getByTestId('campaign-results-6')).toHaveTextContent('5 bought (12.5%) so far');
    expect(screen.getByTestId('campaign-results-6')).toHaveTextContent('6 orders · MVR 812.50');
    fireEvent.click(screen.getByLabelText('View the log for Eid deal'));
    expect(onViewLog).toHaveBeenCalledWith(6);
    expect(within(row).queryByText('View log')).toBeNull();
    fireEvent.click(within(row).getByLabelText('Send a test of Delivery push to me'));
    await waitFor(() => expect(api.testSendSmsCampaign).toHaveBeenCalledWith({ message: 'Hi {name}, free delivery' }));
    expect(await screen.findByTestId('campaign-notice')).toHaveTextContent('Test sent to +9607779999.');
  });

  it('builds an audience from purchases and sends it to preview and create', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText('Likes this item (bought it, or what goes with it)'), { target: { value: '11' } });
    expect(screen.getByTestId('pick-11')).toHaveTextContent('Chicken burger');
    fireEvent.change(screen.getByLabelText('Bought from these categories'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Order type Delivery'));
    fireEvent.change(screen.getByLabelText('Minimum spend MVR'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Birthday month'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Campaign message'), { target: { value: 'Hi {name}, new burger' } });

    fireEvent.click(screen.getByText('👁 Preview Audience'));
    await waitFor(() => expect(api.previewSmsCampaign).toHaveBeenCalledWith({
      message: 'Hi {name}, new burger',
      target_criteria: { likes_item_id: 11, bought_category_ids: [2], order_types: ['delivery'], min_spend_mvr: 500, birthday_month: 10 },
    }));
    const box = await screen.findByTestId('campaign-preview');
    expect(box).toHaveTextContent('7 recipients');
    expect(box).toHaveTextContent('Likes Chicken burger in the last 90 days · Spent MVR 500+');
    expect(box).toHaveTextContent('e.g. Aisha');
    expect(screen.getByTestId('campaign-daily-cap')).toHaveTextContent('Over the daily bulk cap: 4,996 recipients queued in the last 24 hours, 4 left of 5,000.');

    // Removing a chip drops the key entirely.
    fireEvent.click(screen.getByLabelText('Remove Bakery'));
    fireEvent.change(screen.getByPlaceholderText('e.g. Eid Special Offer'), { target: { value: 'Burger launch' } });
    fireEvent.click(screen.getByText('Create Draft'));
    await waitFor(() => expect(api.createSmsCampaign).toHaveBeenCalledWith({
      name: 'Burger launch',
      message: 'Hi {name}, new burger',
      target_criteria: { likes_item_id: 11, order_types: ['delivery'], min_spend_mvr: 500, birthday_month: 10 },
    }));
  });

  it('a recipe fills the audience and text, and one that needs an item waits for it', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText('Recipe'), { target: { value: 'win_back' } });
    expect(screen.getByLabelText('Campaign message')).toHaveValue('Hi {name}, we saved you a seat.');
    expect(screen.getByLabelText('Dormant days')).toHaveValue(60);
    expect(screen.getByPlaceholderText('e.g. Eid Special Offer')).toHaveValue('Win-back offer');
    expect(screen.queryByTestId('recipe-needs')).toBeNull();

    fireEvent.change(screen.getByLabelText('Recipe'), { target: { value: 'new_dish_for_fans' } });
    expect(screen.getByTestId('recipe-needs')).toHaveTextContent('Pick the item this recipe is about.');
    expect(screen.getByText('👁 Preview Audience')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Likes this item (bought it, or what goes with it)'), { target: { value: '12' } });
    expect(screen.queryByTestId('recipe-needs')).toBeNull();
    expect(screen.getByText('👁 Preview Audience')).not.toBeDisabled();
  });

  it('starts from a saved audience, and saves the current filters as a new one', async () => {
    await openForm();
    expect(screen.getByText('Save as audience')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Saved audience'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Minimum paid orders'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Campaign message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByText('👁 Preview Audience'));
    await waitFor(() => expect(api.previewSmsCampaign).toHaveBeenCalledWith(expect.objectContaining({
      target_criteria: { audience_id: 3, min_orders: 2 },
    })));

    fireEvent.click(screen.getByText('Save as audience'));
    fireEvent.change(screen.getByLabelText('Audience name'), { target: { value: 'Burger fans' } });
    fireEvent.click(screen.getByText('Save'));
    // The saved audience is its own definition: the base it was built on is not nested inside it.
    await waitFor(() => expect(api.createSmsAudience).toHaveBeenCalledWith({ name: 'Burger fans', criteria: { min_orders: 2 } }));
    expect(await screen.findByTestId('campaign-notice')).toHaveTextContent('Audience "Burger fans" saved (7 customers).');
    const select = screen.getByLabelText('Saved audience') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Burger fans (7)');
  });

  it('lists recurring campaigns with their last run, pauses one and runs one now', async () => {
    render(<CampaignsTab />);
    const row = await screen.findByTestId('schedule-2');
    expect(row).toHaveTextContent('Every Mon at 10:00');
    expect(row).toHaveTextContent('12 sent');
    expect(row).toHaveTextContent('2 bought · MVR 240.00');
    fireEvent.click(within(row).getByLabelText('Pause We miss you'));
    await waitFor(() => expect(api.updateSmsCampaignSchedule).toHaveBeenCalledWith(2, { is_active: false }));
    expect(await within(screen.getByTestId('schedule-2')).findByText('paused')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('schedule-2')).getByLabelText('Run We miss you now'));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.runSmsCampaignSchedule).toHaveBeenCalledWith(2));
    expect(await screen.findByTestId('campaign-notice')).toHaveTextContent('Sent to 3 recipients.');
  });

  it('turns the form into a recurring campaign when Repeat is set', async () => {
    await openForm();
    fireEvent.change(screen.getByLabelText('Recipe'), { target: { value: 'win_back' } });
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'weekly' } });
    expect(screen.queryByLabelText('Send at')).toBeNull();
    fireEvent.click(screen.getByLabelText('Repeat on Mon'));
    fireEvent.click(screen.getByLabelText('Repeat on Thu'));
    fireEvent.click(screen.getByLabelText('Repeat on Sat'));
    fireEvent.change(screen.getByLabelText('Repeat time'), { target: { value: '18:30' } });
    fireEvent.change(screen.getByLabelText('Cooldown days'), { target: { value: '45' } });
    fireEvent.click(screen.getByText('Create recurring campaign'));
    await waitFor(() => expect(api.createSmsCampaignSchedule).toHaveBeenCalledWith({
      name: 'Win-back offer', message: 'Hi {name}, we saved you a seat.', recipe_key: 'win_back', frequency: 'weekly',
      days_of_week: ['thu', 'sat'], send_time: '18:30', cooldown_days: 45, target_criteria: { dormant_days: 60 },
    }));
    expect(api.createSmsCampaign).not.toHaveBeenCalled();
    expect(await screen.findByTestId('schedule-3')).toHaveTextContent('Every Thu and Sat at 18:30');
  });
});
