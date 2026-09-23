import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SocialHubPage, waitForTestOutcome } from '../pages/SocialHubPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

const mockCan = vi.fn((_slug: string) => true);

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: (slug: string) => mockCan(slug),
    user: { id: 1, name: 'Owner', role: 'owner', permissions: [] },
    loading: false,
  }),
}));

const platforms: Record<string, api.SocialPlatformCaps> = {
  facebook: { text: true, photo: true, requires_photo: false, caption_max: 63206, caption_max_photo: 63206, credentials: ['page_id', 'access_token'] },
  instagram: { text: false, photo: true, requires_photo: true, caption_max: 2200, caption_max_photo: 2200, credentials: ['ig_user_id', 'access_token'] },
  telegram: { text: true, photo: true, requires_photo: false, caption_max: 4096, caption_max_photo: 1024, credentials: ['bot_token', 'chat_id'] },
  viber: { text: true, photo: true, requires_photo: false, caption_max: 7000, caption_max_photo: 7000, credentials: ['auth_token', 'sender_id'] },
};

const options: api.SocialChannelOption[] = [
  { id: 1, platform: 'facebook', name: 'Main Page' },
  { id: 2, platform: 'telegram', name: 'BG News' },
];

const automationBase: api.SocialAutomationConfig = { enabled: false, time: '11:00', channel_ids: [], template: 'T', unattended: false, days: [0, 1, 2, 3, 4, 5, 6], max_age_days: 14 };
const automations: Record<api.SocialAutomationKind, api.SocialAutomationConfig> = {
  special: { ...automationBase },
  new_item: { ...automationBase, time: '16:00', max_age_days: 14 },
  featured: { ...automationBase, time: '12:00', days: [5] },
};

function channel(over: Partial<api.SocialChannelRow>): api.SocialChannelRow {
  return {
    id: 1, platform: 'facebook', name: 'Main Page', remote_account_id: null, is_enabled: true, is_test_channel: false,
    last_published_at: null, credential_summary: { page_id: '••••1111' }, has_credentials: true, recent_failures: 0,
    health: null, ...over,
  };
}

function post(over: Partial<api.SocialPostRow>): api.SocialPostRow {
  return {
    id: 1, status: 'draft', source: 'manual', source_ref: null, business_date: '2026-09-24',
    scheduled_at: null, published_at: null, created_at: '2026-09-24T08:00:00+05:00',
    snapshot: { caption: 'Fresh masroshi today', image_url: null, link_url: null, item_id: null, price: null },
    deliveries: [{ id: 11, status: 'scheduled', channel: { id: 1, platform: 'facebook', name: 'Main Page' }, permalink: null, error_class: null, error_message: null, attempts: [], published_at: null, insights: null, insights_at: null }],
    ...over,
  };
}

const pageOne = { posts: [post({ id: 1 }), post({ id: 2, status: 'published', snapshot: { caption: 'Second', image_url: null, link_url: null, item_id: null, price: null } })], meta: { current_page: 1, last_page: 2, total: 3 } };
const pageTwo = { posts: [post({ id: 3, snapshot: { caption: 'Older post', image_url: null, link_url: null, item_id: null, price: null } })], meta: { current_page: 2, last_page: 2, total: 3 } };

beforeEach(() => {
  mockCan.mockImplementation(() => true);
  vi.spyOn(api, 'fetchSocialPosts').mockImplementation(async (f) => ((typeof f === 'object' && f.page === 2) ? pageTwo : pageOne));
  vi.spyOn(api, 'fetchSocialChannels').mockResolvedValue({ channels: [channel({})], platforms });
  vi.spyOn(api, 'fetchSocialChannelOptions').mockResolvedValue({ channels: options, platforms });
  vi.spyOn(api, 'fetchSocialAutomation').mockResolvedValue({ automation: automations.special, automations });
  vi.spyOn(api, 'updateSocialAutomation').mockImplementation(async (data) => ({ automation: automations.special, automations: { ...automations, [data.kind ?? 'special']: { ...automations[data.kind ?? 'special'], ...data } } }));
  vi.spyOn(api, 'refreshSocialInsights').mockResolvedValue({ post: post({}) });
  vi.spyOn(api, 'fetchAdminCategories').mockResolvedValue({ data: [] } as never);
  vi.spyOn(api, 'fetchAdminItems').mockResolvedValue({ data: [{ id: 7, name: 'Masroshi', base_price: 45, category: { id: 1, name: 'Hedhikaa' } }] } as never);
  vi.spyOn(api, 'fetchSocialItemPreview').mockResolvedValue({ item: {
    id: 7, name: 'Masroshi', name_dv: 'މަސްރޮށި', category: 'Hedhikaa', price: 45, base_price: 45,
    image_url: 'https://bakeandgrill.mv/storage/masroshi.jpg', link_url: 'https://bakeandgrill.mv/menu/7', is_sellable: true,
  } });
  vi.spyOn(api, 'createSocialPost').mockResolvedValue({ post: post({}) });
  vi.spyOn(api, 'updateSocialPost').mockResolvedValue({ post: post({}) });
  vi.spyOn(api, 'publishSocialPostNow').mockResolvedValue({ post: post({}) });
  vi.spyOn(api, 'checkSocialChannel').mockResolvedValue({ channel: channel({}) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const footer = () => within(screen.getByTestId('modal-footer'));

async function openComposer() {
  renderWithRouter(<SocialHubPage />);
  await screen.findByText('Fresh masroshi today');
  fireEvent.click(screen.getByText('+ New post'));
  await screen.findByText('Facebook Page — Main Page');
}

describe('SocialHubPage — posts list', () => {
  it('lists posts, hides test posts by default, and pages', async () => {
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    expect(api.fetchSocialPosts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, include_tests: false }));
    expect(screen.getByText('3 posts')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next →'));
    await screen.findByText('Older post');
    expect(api.fetchSocialPosts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

    fireEvent.click(screen.getByLabelText('Show test posts'));
    await waitFor(() => expect(api.fetchSocialPosts).toHaveBeenLastCalledWith(expect.objectContaining({ include_tests: true, page: 1 })));

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'draft' } });
    await waitFor(() => expect(api.fetchSocialPosts).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft', page: 1 })));
  });

  it('offers Edit only for posts that have not gone out', async () => {
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    const cards = screen.getAllByText(/Fresh masroshi today|Second/).map((el) => el.closest('div[style*="padding"]') as HTMLElement);
    expect(within(cards[0]).getByText('Edit')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Edit')).toBeNull();
  });
});

describe('SocialHubPage — composer', () => {
  it('counts against the tightest selected platform and blocks posting when over', async () => {
    await openComposer();
    fireEvent.click(screen.getByLabelText('Telegram — BG News'));
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'a'.repeat(30) } });
    expect(screen.getByTestId('caption-counter')).toHaveTextContent('30 / 4096 (Telegram)');

    // A photo tightens Telegram to 1024.
    fireEvent.click(screen.getByText('Paste a URL'));
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://bakeandgrill.mv/storage/x.jpg' } });
    expect(screen.getByTestId('caption-counter')).toHaveTextContent('30 / 1024 (Telegram with photo)');
    expect(footer().getByText('Post now')).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'a'.repeat(1100) } });
    expect(footer().getByText('Post now')).toBeDisabled();
    expect(screen.getByText(/Telegram cuts captions at 1024/)).toBeInTheDocument();
    expect(screen.getByTestId('post-preview-telegram')).toBeInTheDocument();
  });

  it('will not post to Instagram without a photo', async () => {
    vi.mocked(api.fetchSocialChannelOptions).mockResolvedValue({
      channels: [{ id: 3, platform: 'instagram', name: 'IG' }], platforms,
    });
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    fireEvent.click(screen.getByText('+ New post'));
    fireEvent.click(await screen.findByLabelText('Instagram — IG'));
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Hello' } });
    expect(screen.getByText(/required for Instagram/)).toBeInTheDocument();
    expect(footer().getByText('Post now')).toBeDisabled();
  });

  it('picking a menu item brings its photo, price and link and suggests a caption', async () => {
    await openComposer();
    fireEvent.click(screen.getByLabelText('Facebook Page — Main Page'));
    fireEvent.change(screen.getByPlaceholderText('Search the menu…'), { target: { value: 'mas' } });
    fireEvent.click(await screen.findByText('Masroshi', {}, { timeout: 2000 }));

    await waitFor(() => expect(api.fetchSocialItemPreview).toHaveBeenCalledWith(7));
    expect((screen.getByLabelText('Caption') as HTMLTextAreaElement).value).toContain('Masroshi · މަސްރޮށި — MVR 45.00');
    expect(screen.getByText("Masroshi's photo")).toBeInTheDocument();
    const preview = screen.getByTestId('post-preview-facebook');
    expect(preview.querySelector('img')).toHaveAttribute('src', 'https://bakeandgrill.mv/storage/masroshi.jpg');

    fireEvent.click(screen.getByText('Save draft'));
    await waitFor(() => expect(api.createSocialPost).toHaveBeenCalledWith(expect.objectContaining({
      item_id: 7, image_url: null, channel_ids: [1], action: 'draft',
    })));
  });

  it('schedules with the browser offset, not a bare wall-clock', async () => {
    await openComposer();
    fireEvent.click(screen.getByLabelText('Facebook Page — Main Page'));
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Later' } });
    fireEvent.change(screen.getByLabelText('Schedule for (your local time)'), { target: { value: '2026-10-01T10:30' } });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => expect(api.createSocialPost).toHaveBeenCalledWith(expect.objectContaining({
      action: 'schedule', scheduled_at: new Date('2026-10-01T10:30').toISOString(),
    })));
  });

  it('edits a draft in place through the update endpoint', async () => {
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await screen.findByText('Edit post #1');
    expect((screen.getByLabelText('Caption') as HTMLTextAreaElement).value).toBe('Fresh masroshi today');
    expect(screen.getByLabelText('Facebook Page — Main Page')).toBeChecked();

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Fresh masroshi, all day' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(api.updateSocialPost).toHaveBeenCalledWith(1, expect.objectContaining({
      caption: 'Fresh masroshi, all day', channel_ids: [1], item_id: null,
    })));
    expect(api.publishSocialPostNow).not.toHaveBeenCalled();
  });

  it('an automation draft keeps its channels locked and can be approved after editing', async () => {
    vi.mocked(api.fetchSocialPosts).mockResolvedValue({
      posts: [post({ id: 5, status: 'awaiting_approval', source: 'auto_special', source_ref: 'special:1' })],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Auto · daily special');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByText('Edit automation draft');
    expect(screen.getByLabelText('Facebook Page — Main Page')).toBeDisabled();

    fireEvent.click(screen.getByText('Save & approve'));
    await waitFor(() => expect(api.updateSocialPost).toHaveBeenCalledWith(5, { caption: 'Fresh masroshi today', image_url: null }));
    expect(api.publishSocialPostNow).toHaveBeenCalledWith(5);
  });
});

describe('SocialHubPage — automations and insights', () => {
  it('shows the three automations and saves each under its own kind', async () => {
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    fireEvent.click(screen.getByText('Automation'));

    const featured = within(await screen.findByTestId('automation-featured'));
    expect(screen.getByTestId('automation-special')).toBeInTheDocument();
    expect(screen.getByTestId('automation-new_item')).toBeInTheDocument();
    expect(featured.getByText('Fri')).toHaveAttribute('aria-pressed', 'true');
    expect(featured.getByText('Mon')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(featured.getByText('Mon'));
    fireEvent.click(featured.getByLabelText('Enabled'));
    fireEvent.click(featured.getByText("Save chef's pick"));
    await waitFor(() => expect(api.updateSocialAutomation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'featured', enabled: true, days: [1, 5],
    })));
    expect(await featured.findByText('Saved.')).toBeInTheDocument();

    const newItem = within(screen.getByTestId('automation-new_item'));
    fireEvent.change(newItem.getByLabelText('Counts as new for (days)'), { target: { value: '30' } });
    fireEvent.click(newItem.getByText('Save new on the menu'));
    await waitFor(() => expect(api.updateSocialAutomation).toHaveBeenCalledWith(expect.objectContaining({ kind: 'new_item', max_age_days: 30 })));
  });

  it('shows engagement numbers on published deliveries and can refresh them', async () => {
    vi.mocked(api.fetchSocialPosts).mockResolvedValue({
      posts: [post({
        id: 4, status: 'published',
        deliveries: [{ id: 41, status: 'published', channel: { id: 1, platform: 'facebook', name: 'Main Page' }, permalink: 'https://facebook.com/1', error_class: null, error_message: null, attempts: [], published_at: '2026-09-23T10:00:00+05:00', insights: { likes: 12, comments: 3, shares: 2 }, insights_at: '2026-09-24T09:30:00+05:00' }],
      })],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    expect(screen.getByTestId('delivery-insights')).toHaveTextContent('♥ 12 · 💬 3 · ↗ 2');

    fireEvent.click(screen.getByText('Refresh stats'));
    await waitFor(() => expect(api.refreshSocialInsights).toHaveBeenCalledWith(4));
  });
});

describe('SocialHubPage — channels', () => {
  it('shows the health pill and can check now', async () => {
    vi.mocked(api.fetchSocialChannels).mockResolvedValue({
      channels: [
        channel({ id: 1, health: { status: 'warning', message: 'Connected; expires soon.', account_label: 'Bake & Grill', checked_at: '2026-09-24T09:15:00+05:00', token_expires_at: '2026-09-27T09:00:00+05:00', token_days_left: 3 } }),
        channel({ id: 2, name: 'IG', platform: 'instagram', health: { status: 'error', message: 'Meta says the access token is no longer valid.', account_label: null, checked_at: '2026-09-24T09:15:00+05:00', token_expires_at: null, token_days_left: null } }),
        channel({ id: 3, name: 'TG', platform: 'telegram', health: { status: 'ok', message: 'Connected.', account_label: 'BG News', checked_at: '2026-09-24T09:15:00+05:00', token_expires_at: null, token_days_left: null } }),
      ],
      platforms,
    });
    renderWithRouter(<SocialHubPage />);
    await screen.findByText('Fresh masroshi today');
    fireEvent.click(screen.getByText('Channels'));

    expect(await screen.findByText('Token expires in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Not working: Meta says the access token is no longer valid.')).toBeInTheDocument();
    expect(screen.getByText('Connected as BG News')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Check now')[0]);
    await waitFor(() => expect(api.checkSocialChannel).toHaveBeenCalledWith(1));
  });
});

describe('waitForTestOutcome', () => {
  const sleep = async () => {};
  const delivered = (status: string, extra: Partial<api.SocialDeliveryRow> = {}) => ({
    post: post({ id: 9, deliveries: [{ id: 1, status, channel: null, permalink: null, error_class: null, error_message: null, attempts: [], published_at: null, insights: null, insights_at: null, ...extra }] }),
  });

  it('reports a published test post with its link', async () => {
    vi.spyOn(api, 'fetchSocialPost')
      .mockResolvedValueOnce(delivered('queued'))
      .mockResolvedValueOnce(delivered('published', { permalink: 'https://t.me/bg/1' }));
    expect(await waitForTestOutcome(9, { sleep })).toBe('Test post published — https://t.me/bg/1');
  });

  it('reports a failure with the platform reason', async () => {
    vi.spyOn(api, 'fetchSocialPost').mockResolvedValue(delivered('failed', { error_message: 'Error validating access token' }));
    expect(await waitForTestOutcome(9, { sleep })).toBe('Test post failed: Error validating access token');
  });

  it('gives up honestly when nothing picks the job up', async () => {
    vi.spyOn(api, 'fetchSocialPost').mockResolvedValue(delivered('queued'));
    expect(await waitForTestOutcome(9, { sleep, attempts: 3 })).toMatch(/still queued/);
    expect(api.fetchSocialPost).toHaveBeenCalledTimes(3);
  });
});
