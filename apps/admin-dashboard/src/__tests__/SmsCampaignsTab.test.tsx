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
});

async function openForm() {
  render(<CampaignsTab />);
  await screen.findByTestId('campaign-5');
  fireEvent.click(screen.getByText('+ New Campaign'));
  await screen.findByTestId('audience-builder');
}

describe('SMS CampaignsTab — purchase-based targeting', () => {
  it('lists campaigns with their audience and offers a test send from the row', async () => {
    render(<CampaignsTab />);
    const row = await screen.findByTestId('campaign-5');
    expect(row).toHaveTextContent('Delivery in the last 90 days');
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
});
