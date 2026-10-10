import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MessagesTab } from '../pages/Notifications/MessagesTab';
import { renderWithRouter } from './testUtils';
import * as api from '../api';
import * as tgApi from '../api/telegram';

/*
 * Notifications → Messages (notifications audit, 2026-10-10): every text,
 * email and Telegram alert, one row each with its own switches. Ported
 * from the SMS Control Center's tests, plus what is new: no "also needs",
 * the "when it sends" numbers in the row, the Telegram-only rows and
 * links that land on one row.
 */

const mockCan = vi.fn();
const mockUser = { id: 1, name: 'Owner', role: 'owner', permissions: [] as string[] };

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: mockCan,
    user: mockUser,
    loading: false,
  }),
}));

const typesFixture: api.SmsControlCenterType[] = [
  {
    key: 'auth_customer_otp',
    label: 'Customer login OTP',
    category: 'auth',
    enabled: true,
    always_on: true,
    suppressible: false,
    recipients: 'The customer requesting login / verification',
    user_initiated: false,
    send_permission: null,
    send_permission_label: 'System-initiated — no manual sending',
    roles_with_permission: ['System'],
    template: { id: 1, slug: 'auth_customer_otp', body: 'Your code is {{code}}', variables: [{ name: 'code' }] },
    sample_variables: { code: '123456' },
    last_30_days: { count: 3, cost_mvr: 0.75 },
  },
  {
    key: 'giftcard_delivery',
    label: 'Gift card delivery',
    category: 'transactional',
    enabled: true,
    always_on: false,
    suppressible: false,
    recipients: 'Gift card recipient phone',
    user_initiated: false,
    send_permission: 'sms.transactional.manage',
    send_permission_label: 'Manage transactional SMS',
    roles_with_permission: ['Owner', 'Manager'],
    template: { id: 2, slug: 'giftcard_delivery', body: 'Gift card {{amount}}', variables: [{ name: 'amount' }] },
    sample_variables: { amount: 'MVR 100.00' },
    last_30_days: { count: 1, cost_mvr: 0.25 },
  },
  {
    key: 'marketing_campaign',
    label: 'Bulk campaign',
    category: 'marketing',
    enabled: true,
    always_on: false,
    suppressible: true,
    recipients: 'Campaign audience',
    user_initiated: true,
    send_permission: 'sms.campaigns.send',
    send_permission_label: 'Send SMS campaigns',
    roles_with_permission: ['Owner'],
    template: null,
    last_30_days: { count: 0, cost_mvr: 0 },
  },
  {
    key: 'owner_stock_reorder',
    label: 'Owner: stock at reorder point',
    category: 'staff',
    enabled: true,
    telegram_applies: true,
    always_on: false,
    suppressible: false,
    recipients: 'Owners & managers',
    user_initiated: false,
    send_permission: null,
    send_permission_label: 'System-initiated — no manual sending',
    roles_with_permission: ['System'],
    template: null,
    last_30_days: { count: 4, cost_mvr: 1 },
    recipients_configurable: true,
    default_recipient_mode: 'owners_managers',
    recipients_config: { mode: 'owners_managers', user_ids: [], phones: [] },
    recipients_resolved: ['9607770001'],
  },
  {
    key: 'owner_shift_left_open',
    label: 'Owner: shift left open',
    category: 'staff',
    enabled: true,
    telegram_applies: true,
    always_on: false,
    suppressible: false,
    recipients: 'Owners & managers',
    user_initiated: false,
    send_permission: null,
    send_permission_label: 'System-initiated — no manual sending',
    roles_with_permission: ['System'],
    template: null,
    last_30_days: { count: 0, cost_mvr: 0 },
  },
];

const budgetFixture: api.SmsBudgetSnapshot = {
  monthly_segment_ceiling: 1000,
  per_campaign_segment_ceiling: 200,
  period_start: '2026-08-01',
  period_segments_used: 12,
  period_cost_mvr: 3,
  period_blocked_count: 0,
  monthly_remaining: 988,
  monthly_exhausted: false,
};

const queueFixture: api.SmsCampaignQueueHealth = {
  running_campaigns: 0, pending_recipients: 0, failed_recipients_24h: 0, failed_queue_jobs: 0, campaigns: [],
};

const permissionOptions = [
  { slug: '__system__', name: 'System-initiated — no manual sending' },
  { slug: 'sms.campaigns.send', name: 'Send SMS campaigns' },
  { slug: 'sms.transactional.manage', name: 'Manage transactional SMS' },
  { slug: 'orders.send_sms_bill', name: 'Send SMS bill' },
];

function mockControlCenter(overrides?: Partial<api.SmsControlCenterResponse>) {
  vi.spyOn(api, 'getSmsControlCenter').mockResolvedValue({
    global_kill_switch: false,
    demo_mode: true,
    budget: budgetFixture,
    campaign_queue: queueFixture,
    permission_options: permissionOptions,
    types: typesFixture,
    delivery_rules: { quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '08:00', quiet_hours_alerts: false, marketing_daily_cap: 1 },
    quiet_now: false,
    deferred_count: 0,
    recipient_modes: ['owners_managers', 'owner_only', 'business_phone', 'staff', 'custom'],
    staff_options: [{ id: 5, name: 'Ali', phone: '9607770002', role: 'Manager' }],
    telegram_alerts_on: true,
    telegram_bot_ready: true,
    ...overrides,
  });
}

function grant(perms: string[]) {
  mockCan.mockImplementation((slug?: string) => !slug || perms.includes(slug));
}

const MANAGE = ['sms.settings.manage', 'sms.templates.edit', 'sms.logs.view', 'settings.update'];

/** Open one row's controls. Only one is open at a time, so queries can use screen. */
async function expand(key: string): Promise<HTMLElement> {
  const row = await screen.findByTestId(`sms-type-${key}`);
  fireEvent.click(within(row).getByRole('button', { name: /^Edit$/ }));
  await within(row).findByRole('button', { name: /Hide controls/ });
  return row;
}

describe('Notifications → Messages', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUser.role = 'owner';
    grant(MANAGE);
    mockControlCenter();
    vi.spyOn(api, 'updateSmsType').mockResolvedValue({
      key: 'giftcard_delivery',
      enabled: false,
      template: { id: 2, slug: 'giftcard_delivery', body: 'Gift card {{amount}} - shop now', variables: [{ name: 'amount' }] },
      estimate: { encoding: 'gsm7', length: 28, segments: 1, cost_mvr: 0.25 },
      send_permission: 'orders.send_sms_bill',
      send_permission_label: 'Send SMS bill',
    });
    vi.spyOn(api, 'previewSmsType').mockResolvedValue({
      preview: 'Gift card MVR 100.00 - shop now',
      estimate: { encoding: 'gsm7', length: 32, segments: 2, cost_mvr: 0.5 },
      sample_variables: { amount: 'MVR 100.00' },
    });
    vi.spyOn(api, 'getOpsAlertsSettings').mockResolvedValue({ settings: { shift_open_alert_hours: 12, shift_variance_alert_mvr: 50, unstarted_order_alert_minutes: 10 } });
    vi.spyOn(api, 'updateOpsAlertsSettings').mockResolvedValue({ message: 'ok', settings: { shift_open_alert_hours: 9, shift_variance_alert_mvr: 50, unstarted_order_alert_minutes: 10 } });
    vi.spyOn(tgApi, 'fetchTelegram').mockResolvedValue({
      bots: [], people: [], roles: [], webhook_base: '',
      settings: { alerts_enabled: true, day_report: true, alert_voids: true, alert_cash: true, alert_cash_min: 0 },
    });
    vi.spyOn(tgApi, 'updateTelegramSettings').mockResolvedValue({
      settings: { alerts_enabled: true, day_report: false, alert_voids: true, alert_cash: true, alert_cash_min: 0 },
    });
  });

  it('lists every message by group, with who gets it', async () => {
    renderWithRouter(<MessagesTab />);
    expect(await screen.findByRole('heading', { name: 'Sign-in codes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'To customers' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Staff & owner alerts' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Marketing' })).toBeTruthy();
    expect(screen.getByText(/Goes to: Gift card recipient phone/)).toBeTruthy();
    expect(screen.getAllByText(/Always on/i).length).toBeGreaterThan(0);
  });

  it('never names a second switch somewhere else', async () => {
    renderWithRouter(<MessagesTab />);
    await screen.findByText('Gift card delivery');
    expect(screen.queryByText(/Also needs/)).toBeNull();
  });

  it('switches SMS, Email and Telegram per row', async () => {
    renderWithRouter(<MessagesTab />);
    await screen.findByText('Gift card delivery');
    fireEvent.click(screen.getByLabelText('Toggle Gift card delivery'));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('giftcard_delivery', { enabled: false }));

    vi.mocked(api.updateSmsType).mockResolvedValueOnce({ key: 'owner_stock_reorder', email_enabled: false });
    fireEvent.click(screen.getByLabelText('Toggle email for Owner: stock at reorder point'));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('owner_stock_reorder', { email_enabled: false }));

    vi.mocked(api.updateSmsType).mockResolvedValueOnce({ key: 'owner_stock_reorder', telegram_enabled: false });
    fireEvent.click(screen.getByLabelText('Toggle Telegram for Owner: stock at reorder point'));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('owner_stock_reorder', { telegram_enabled: false }));
  });

  it('marks a row with SMS off but email on as Email only, and counts it as on', async () => {
    mockControlCenter({
      types: typesFixture.map((t) => (t.key === 'owner_stock_reorder' ? { ...t, enabled: false, email_enabled: true, telegram_enabled: false } : t)),
    });
    renderWithRouter(<MessagesTab />);
    expect(await screen.findByTestId('email-only-owner_stock_reorder')).toHaveTextContent('Email only');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'off' } });
    expect(screen.queryByTestId('sms-type-owner_stock_reorder')).toBeNull();
  });

  it('always-on rows have no SMS switch', async () => {
    renderWithRouter(<MessagesTab />);
    await screen.findByText('Customer login OTP');
    expect(screen.queryByLabelText('Toggle Customer login OTP')).toBeNull();
    expect(screen.getByLabelText('Toggle Gift card delivery')).toBeTruthy();
  });

  it('saves wording, warns about Unicode and previews the cost', async () => {
    renderWithRouter(<MessagesTab />);
    await expand('giftcard_delivery');
    const textarea = screen.getByRole('textbox', { name: /Gift card delivery wording/i });
    fireEvent.change(textarea, { target: { value: 'Gift card {{amount}} — shop now' } });
    expect(await screen.findByText(/Unicode encoding \(UCS-2\)/i)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: 'Gift card {{amount}} - shop now' } });
    fireEvent.click(screen.getByRole('button', { name: /^Preview$/i }));
    await waitFor(() => expect(api.previewSmsType).toHaveBeenCalledWith('giftcard_delivery', 'Gift card {{amount}} - shop now'));
    expect(await screen.findByText('Gift card MVR 100.00 - shop now')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save message/i }));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('giftcard_delivery', { body: 'Gift card {{amount}} - shop now' }));
  });

  it('edits a message\'s other wordings on its row', async () => {
    mockControlCenter({
      types: typesFixture.map((t) => (t.key === 'giftcard_delivery'
        ? { ...t, extra_templates: [{ id: 9, slug: 'giftcard_delivery_alt', label: 'When sent by email link', body: 'Alt {{amount}}', variables: [{ name: 'amount' }] }] }
        : t)),
    });
    vi.mocked(api.updateSmsType).mockResolvedValueOnce({
      key: 'giftcard_delivery',
      extra_templates: [{ id: 9, slug: 'giftcard_delivery_alt', label: 'When sent by email link', body: 'New {{amount}}', variables: [{ name: 'amount' }] }],
    });
    renderWithRouter(<MessagesTab />);
    await expand('giftcard_delivery');
    const box = screen.getByRole('textbox', { name: 'Gift card delivery wording: When sent by email link' });
    expect(box).toHaveValue('Alt {{amount}}');
    const save = within(screen.getByTestId('extra-wording-giftcard_delivery_alt')).getByRole('button', { name: 'Save wording' });
    expect(save).toBeDisabled();
    fireEvent.change(box, { target: { value: 'New {{amount}}' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('giftcard_delivery', { extra_templates: { giftcard_delivery_alt: 'New {{amount}}' } }));
    await waitFor(() => expect(within(screen.getByTestId('extra-wording-giftcard_delivery_alt')).getByRole('button', { name: 'Save wording' })).toBeDisabled());
  });

  it('changes who may send it by hand', async () => {
    renderWithRouter(<MessagesTab />);
    await expand('giftcard_delivery');
    const select = screen.getByLabelText(/Who can send/i) as HTMLSelectElement;
    expect(Array.from(select.options).some((o) => (o.textContent ?? '').includes('orders.send_sms_bill'))).toBe(true);
    fireEvent.change(select, { target: { value: 'orders.send_sms_bill' } });
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('giftcard_delivery', { send_permission: 'orders.send_sms_bill' }));
  });

  it('lets the owner choose who gets an owner alert', async () => {
    vi.mocked(api.updateSmsType).mockResolvedValue({
      key: 'owner_stock_reorder',
      recipients_config: { mode: 'staff', user_ids: [5], phones: [] },
      recipients_resolved: ['9607770002'],
    });
    renderWithRouter(<MessagesTab />);
    await expand('owner_stock_reorder');
    const select = screen.getByLabelText(/Who receives it/i) as HTMLSelectElement;
    expect(select.value).toBe('owners_managers');
    fireEvent.change(select, { target: { value: 'staff' } });
    fireEvent.click(screen.getByLabelText(/Ali \(Manager\)/));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('owner_stock_reorder', { recipients: { mode: 'staff', user_ids: [5], phones: [] } }));
    expect(await screen.findByText(/Goes to: 9607770002/)).toBeTruthy();
  });

  it('says when an alert goes in its row, and 0 is not a way to switch it off', async () => {
    renderWithRouter(<MessagesTab />);
    await expand('owner_shift_left_open');
    const field = await screen.findByLabelText(/When a shift has been open for \(hours\)/);
    await waitFor(() => expect(field).toHaveValue(12));

    fireEvent.change(field, { target: { value: '0' } });
    expect(screen.getByText(/To stop it, switch the row off/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(field, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateOpsAlertsSettings).toHaveBeenCalledWith({ shift_open_alert_hours: 9 }));
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('without Settings access the number is not shown or loaded', async () => {
    grant(['sms.settings.manage', 'sms.templates.edit', 'sms.logs.view']);
    mockUser.role = 'manager';
    renderWithRouter(<MessagesTab />);
    await expand('owner_shift_left_open');
    expect(screen.getByTestId('timing-owner_shift_left_open')).toHaveTextContent(/someone with Settings access/);
    expect(api.getOpsAlertsSettings).not.toHaveBeenCalled();
  });

  it('shows the Telegram-only alerts as rows and switches them', async () => {
    grant([...MANAGE, 'telegram.manage']);
    renderWithRouter(<MessagesTab />);
    const row = await screen.findByTestId('telegram-only-day_report');
    fireEvent.click(within(row).getByLabelText(/Toggle Telegram for Owner: day report/));
    await waitFor(() => expect(tgApi.updateTelegramSettings).toHaveBeenCalledWith({ day_report: false }));
    await waitFor(() => expect(within(screen.getByTestId('telegram-only-day_report')).getByText('Off')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Cash alert from amount'), { target: { value: '500' } });
    fireEvent.blur(screen.getByLabelText('Cash alert from amount'));
    await waitFor(() => expect(tgApi.updateTelegramSettings).toHaveBeenCalledWith({ alert_cash_min: 500 }));
  });

  it('has no Telegram-only rows without the Telegram permission', async () => {
    renderWithRouter(<MessagesTab />);
    await screen.findByText('Gift card delivery');
    expect(screen.queryByTestId('telegram-only')).toBeNull();
    expect(tgApi.fetchTelegram).not.toHaveBeenCalled();
  });

  it('warns that the Telegram switches send nothing while Telegram alerts are off', async () => {
    mockControlCenter({ telegram_alerts_on: false });
    renderWithRouter(<MessagesTab />);
    expect(await screen.findByTestId('telegram-off-banner')).toHaveTextContent(/Telegram alerts are switched off/);
  });

  it('a link from another page lands on its row, open', async () => {
    renderWithRouter(<MessagesTab />, { route: '/notifications/messages?open=owner_stock_reorder' });
    const row = await screen.findByTestId('sms-type-owner_stock_reorder');
    expect(await within(row).findByRole('button', { name: /Hide controls/ })).toBeTruthy();
    expect(screen.queryByText('Gift card delivery')).toBeNull();
  });

  it('?q= narrows the list', async () => {
    renderWithRouter(<MessagesTab />, { route: '/notifications/messages?q=stock' });
    expect(await screen.findByText('Owner: stock at reorder point')).toBeTruthy();
    expect(screen.queryByText('Gift card delivery')).toBeNull();
  });

  it('opens with the phones owner alerts go to', async () => {
    mockControlCenter({ demo_mode: false, business_phone: null, owner_phones: [{ name: 'Ahmed', phone: '+9607770001' }], deferred_count: 3 });
    renderWithRouter(<MessagesTab />);
    const overview = await screen.findByTestId('sms-overview');
    expect(overview.textContent).toMatch(/Not set/);
    expect(overview.textContent).toMatch(/Ahmed: \+9607770001/);
    expect(overview.textContent).toMatch(/3 waiting for quiet hours to end/);
    expect(overview.textContent).toMatch(/12 segments · MVR 3\.00/);
  });

  it('search and the group chips narrow the list', async () => {
    renderWithRouter(<MessagesTab />);
    await screen.findByText('Gift card delivery');
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'stock' } });
    expect(screen.queryByText('Gift card delivery')).toBeNull();
    expect(screen.getByText('Owner: stock at reorder point')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Marketing/ }));
    expect(screen.getByText('Bulk campaign')).toBeTruthy();
    expect(screen.queryByText('Gift card delivery')).toBeNull();
  });

  it('sends the wording to my phone as a test', async () => {
    vi.spyOn(api, 'testSmsType').mockResolvedValue({ ok: true, message: 'Test sent to +9607770001.', to: '+9607770001', status: 'sent', text: '[TEST] Gift card MVR 100.00' });
    renderWithRouter(<MessagesTab />);
    await expand('giftcard_delivery');
    fireEvent.click(screen.getByRole('button', { name: /Send me a test/i }));
    await waitFor(() => expect(api.testSmsType).toHaveBeenCalledWith('giftcard_delivery', {}));
    expect((await screen.findByTestId('test-result-giftcard_delivery')).textContent).toMatch(/Test sent to \+9607770001/);
  });

  it('log-only users can look but not change anything', async () => {
    mockUser.role = 'manager';
    grant(['sms.logs.view']);
    renderWithRouter(<MessagesTab />);
    await screen.findByText('Gift card delivery');
    const toggle = screen.getByLabelText('Toggle Gift card delivery') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(api.updateSmsType).not.toHaveBeenCalled();
    await expand('giftcard_delivery');
    expect((screen.getByRole('textbox', { name: /Gift card delivery wording/i }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Who can send/i) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/changing them needs Manage SMS settings/)).toBeTruthy();
  });
});
