import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RulesTab } from '../pages/Notifications/RulesTab';
import { PeopleTab } from '../pages/Notifications/PeopleTab';
import { LogTab } from '../pages/Notifications/LogTab';
import { NotificationsHub } from '../pages/NotificationsHub';
import { SmsPage } from '../pages/SmsPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';
import * as tgApi from '../api/telegram';

/*
 * Notifications → Rules, People and Log, the hub's tabs per permission, and
 * the old SMS links landing on the new page (notifications audit, 2026-10-10).
 */

const mockCan = vi.fn();
const mockUser = { id: 1, name: 'Owner', role: 'owner', permissions: [] as string[] };

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: mockCan, user: mockUser, loading: false }),
}));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

function grant(perms: string[]) {
  mockCan.mockImplementation((slug?: string) => !slug || perms.includes(slug));
}

const budget: api.SmsBudgetSnapshot = {
  monthly_segment_ceiling: 1000, per_campaign_segment_ceiling: 200, period_start: '2026-10-01',
  period_segments_used: 12, period_cost_mvr: 3, period_blocked_count: 0, monthly_remaining: 988, monthly_exhausted: false,
};

function mockControlCenter(overrides?: Partial<api.SmsControlCenterResponse>) {
  vi.spyOn(api, 'getSmsControlCenter').mockResolvedValue({
    global_kill_switch: false,
    demo_mode: false,
    budget,
    campaign_queue: {
      running_campaigns: 1, pending_recipients: 40, failed_recipients_24h: 2, failed_queue_jobs: 1,
      campaigns: [{ id: 9, name: 'Weekend blast', status: 'running', pending: 40, failed: 2, total: 100 }],
    },
    permission_options: [],
    types: [],
    delivery_rules: {
      quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '08:00', quiet_hours_alerts: false, marketing_daily_cap: 1,
      bulk_daily_recipient_cap: 5000, log_retention_days: 365, marketing_opt_out_line: 'Stop: {url}',
    },
    quiet_now: false,
    deferred_count: 0,
    telegram_alerts_on: true,
    telegram_bot_ready: true,
    ...overrides,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockUser.role = 'owner';
  grant(['sms.settings.manage', 'sms.logs.view', 'telegram.manage', 'staff.update', 'sms.contacts.manage']);
  mockControlCenter();
  vi.spyOn(tgApi, 'fetchTelegram').mockResolvedValue({
    bots: [{ id: 1, name: 'Staff bot', username: 'bot', roles: ['owner'], is_enabled: true, linked_count: 1, last_checked_at: null, last_error: null, token_hint: null }],
    people: [], roles: [], webhook_base: '',
    settings: { alerts_enabled: true, day_report: true },
  });
  vi.spyOn(tgApi, 'updateTelegramSettings').mockResolvedValue({ settings: { alerts_enabled: false, day_report: true } });
});

describe('Notifications → Rules', () => {
  beforeEach(() => {
    vi.spyOn(api, 'updateSmsGlobalKillSwitch').mockResolvedValue({ global_kill_switch: true });
    vi.spyOn(api, 'updateSmsBudget').mockResolvedValue({ budget });
    vi.spyOn(api, 'updateSmsDeliveryRules').mockResolvedValue({
      delivery_rules: { quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '07:30', quiet_hours_alerts: false, marketing_daily_cap: 2 },
      quiet_now: false,
    });
  });

  it('asks before stopping all SMS, and only the owner sees the button', async () => {
    renderWithRouter(<RulesTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop all SMS' }));
    expect(await screen.findByText(/including login codes/i)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop all SMS' }));
    await waitFor(() => expect(api.updateSmsGlobalKillSwitch).toHaveBeenCalledWith(true));
  });

  it('hides Stop all SMS from anyone but the owner', async () => {
    mockUser.role = 'manager';
    renderWithRouter(<RulesTab />);
    expect(await screen.findByText(/Only the owner can change this/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop all SMS' })).toBeNull();
  });

  it('switches Telegram alerts off here', async () => {
    renderWithRouter(<RulesTab />);
    const rule = await screen.findByTestId('telegram-alerts-rule');
    const sw = await within(rule).findByRole('switch', { name: 'Telegram alerts' });
    fireEvent.click(sw);
    await waitFor(() => expect(tgApi.updateTelegramSettings).toHaveBeenCalledWith({ alerts_enabled: false }));
  });

  it('shows the Telegram switch read-only without the Telegram permission', async () => {
    grant(['sms.settings.manage', 'sms.logs.view']);
    mockUser.role = 'manager';
    renderWithRouter(<RulesTab />);
    const rule = await screen.findByTestId('telegram-alerts-rule');
    expect(within(rule).getByRole('switch', { name: 'Telegram alerts' })).toBeDisabled();
    expect(rule).toHaveTextContent(/Changed by whoever manages Telegram/);
    expect(tgApi.fetchTelegram).not.toHaveBeenCalled();
  });

  it('saves the spending limits', async () => {
    renderWithRouter(<RulesTab />);
    await screen.findByText('Spending limit');
    fireEvent.change(screen.getByLabelText(/Monthly segments/i), { target: { value: '750' } });
    fireEvent.change(screen.getByLabelText(/Per-campaign segments/i), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Save limits/i }));
    await waitFor(() => expect(api.updateSmsBudget).toHaveBeenCalledWith({ monthly_segment_ceiling: 750, per_campaign_segment_ceiling: 150 }));
  });

  it('shows a reached limit', async () => {
    mockControlCenter({ budget: { ...budget, monthly_segment_ceiling: 12, monthly_remaining: 0, monthly_exhausted: true } });
    renderWithRouter(<RulesTab />);
    expect(await screen.findByText(/This month: 12 segments/i)).toBeTruthy();
    expect(screen.getByText(/Limit reached/)).toBeTruthy();
  });

  it('saves quiet hours and the marketing limit', async () => {
    renderWithRouter(<RulesTab />);
    await screen.findByText(/Quiet hours off/);
    fireEvent.click(screen.getByLabelText(/^Quiet hours$/i));
    fireEvent.change(screen.getByLabelText(/^Until$/i), { target: { value: '07:30' } });
    fireEvent.change(screen.getByLabelText(/Marketing texts per number per day/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Save rules/i }));
    await waitFor(() => expect(api.updateSmsDeliveryRules).toHaveBeenCalledWith(expect.objectContaining({
      quiet_hours_enabled: true, quiet_hours_end: '07:30', marketing_daily_cap: 2,
    })));
    expect(await screen.findByText(/Quiet hours 22:00–07:30/)).toBeTruthy();
  });

  it('says plainly that order alerts are held too when owner alerts are', async () => {
    renderWithRouter(<RulesTab />);
    expect(await screen.findByLabelText(/Hold staff and owner alerts too, order alerts included/)).toBeTruthy();
  });

  it('shows the campaign queue', async () => {
    renderWithRouter(<RulesTab />);
    expect(await screen.findByText(/Pending recipients: 40/)).toBeTruthy();
    expect(screen.getByText(/#9 Weekend blast/)).toBeTruthy();
  });
});

describe('Notifications → People', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchStaff').mockResolvedValue({
      staff: [
        { id: 4, name: 'Mariyam', email: 'mariyam@example.mv', phone: null, role: 'staff', role_name: 'Staff', role_id: 3, is_active: true, has_pin: true, two_factor_enabled: false, last_login_at: null, created_at: '2026-01-01' },
        { id: 5, name: 'Ali', email: 'ali@example.mv', phone: '7770002', role: 'manager', role_name: 'Manager', role_id: 2, is_active: true, has_pin: true, two_factor_enabled: false, last_login_at: null, created_at: '2026-01-01' },
      ],
      roles: [],
    });
    vi.spyOn(api, 'getStaffNotificationPrefs').mockImplementation(async (id: number) => ({
      prefs: { user_id: id, notifications_enabled: id === 5, order_types: null, menu_group_ids: null, category_ids: null, is_fallback: false, fallback_priority: 0 },
    }));
    vi.spyOn(api, 'updateStaffNotificationPrefs').mockImplementation(async (id: number, data) => ({
      prefs: { user_id: id, notifications_enabled: true, order_types: null, menu_group_ids: null, category_ids: null, is_fallback: false, fallback_priority: 0, ...data },
    }));
    vi.spyOn(api, 'getNotifyChannels').mockResolvedValue({
      channels: ['sms', 'email', 'telegram'],
      roles: [
        { key: 'owner', label: 'Owner', channels: ['sms', 'email', 'telegram'] },
        { key: 'manager', label: 'Manager', channels: ['sms', 'email', 'telegram'] },
        { key: 'staff', label: 'Staff', channels: ['sms', 'email', 'telegram'] },
      ],
      people: [
        { id: 4, name: 'Mariyam', role: 'staff', role_label: 'Staff', phone: null, email: 'mariyam@example.mv', telegram_linked: false, own_channels: null, channels: ['sms', 'email', 'telegram'] },
        { id: 5, name: 'Ali', role: 'manager', role_label: 'Manager', phone: '7770002', email: 'ali@example.mv', telegram_linked: true, own_channels: null, channels: ['sms', 'email', 'telegram'] },
      ],
    });
    vi.spyOn(api, 'updateNotifyPerson').mockImplementation(async (id, channels) => ({
      person: { id, name: id === 4 ? 'Mariyam' : 'Ali', role: 'staff', role_label: 'Staff', phone: null, email: 'x@example.mv', telegram_linked: false, own_channels: channels, channels: channels ?? ['sms', 'email', 'telegram'] },
    }));
    vi.spyOn(api, 'updateNotifyRoles').mockResolvedValue({ roles: { owner: ['sms', 'email', 'telegram'], manager: ['email', 'telegram'], staff: ['sms', 'email', 'telegram'] } });
    vi.spyOn(api, 'fetchSmsContacts').mockResolvedValue({ contacts: [] });
    mockControlCenter({
      staff_options: [{ id: 4, name: 'Mariyam', phone: null, role: 'Staff', role_slug: 'staff' }, { id: 5, name: 'Ali', phone: '7770002', role: 'Manager', role_slug: 'manager' }],
      audience_groups: [{ key: 'role:owner', label: 'Owners', count: 1 }, { key: 'role:manager', label: 'Managers', count: 1 }, { key: 'role:staff', label: 'Staff (cashiers)', count: 1 }],
      types: [
        {
          key: 'owner_stock_reorder', label: 'Owner: stock at reorder point', category: 'staff', channels: ['sms', 'email', 'telegram'], enabled: true, always_on: false, suppressible: false,
          recipients: 'Owners & managers', user_initiated: false, send_permission: null, send_permission_label: 'System', roles_with_permission: ['System'], template: null, last_30_days: { count: 0, cost_mvr: 0 },
          audience_configurable: true, audience_custom: false,
          audience: { groups: ['role:owner', 'role:manager'], users: [], except: [], phones: [], emails: [] },
          audience_default: { groups: ['role:owner', 'role:manager'], users: [], except: [], phones: [], emails: [] },
          audience_people: { people: [{ id: 5, name: 'Ali', role: 'Manager', reach: ['sms', 'email', 'telegram'] }], extras: [], groups: ['Owners', 'Managers'], note: null },
        },
        {
          key: 'staff_low_stock_menu', label: 'Staff: menu item low stock', category: 'staff', channels: ['sms', 'email', 'telegram'], enabled: true, always_on: false, suppressible: false,
          recipients: 'Owners & managers', user_initiated: false, send_permission: null, send_permission_label: 'System', roles_with_permission: ['System'], template: null, last_30_days: { count: 0, cost_mvr: 0 },
          audience_configurable: true, audience_custom: true,
          audience: { groups: ['role:owner'], users: [], except: [5], phones: [], emails: [] },
          audience_default: { groups: ['role:owner', 'role:manager'], users: [], except: [], phones: [], emails: [] },
          audience_people: { people: [], extras: [], groups: ['Owners'], note: null },
        },
      ],
    });
  });

  it('shows one card per person: channels, order alerts and how many alerts reach them', async () => {
    renderWithRouter(<PeopleTab />);
    const sw = await screen.findByRole('switch', { name: 'Order alerts for Mariyam' });
    expect(sw).not.toBeDisabled();
    expect(screen.getByText('No phone: email or Telegram')).toBeTruthy();
    fireEvent.click(sw);
    await waitFor(() => expect(api.updateStaffNotificationPrefs).toHaveBeenCalledWith(4, { notifications_enabled: true }));

    const ali = screen.getByTestId('nc-person-5');
    expect(await within(ali).findByText(/1 staff and owner alert reaches them/)).toBeTruthy();
    fireEvent.change(within(ali).getByRole('combobox', { name: 'Channels for Ali' }), { target: { value: 'own' } });
    await waitFor(() => expect(api.updateNotifyPerson).toHaveBeenCalledWith(5, ['sms', 'email', 'telegram']));

    // By role: channels and a link to the alerts that reach the role.
    const manager = screen.getByTestId('nc-role-manager');
    expect(within(manager).getByRole('link', { name: 'Alerts that reach Manager' })).toHaveTextContent('1 alert');
    fireEvent.click(within(manager).getByRole('button', { name: /SMS/ }));
    await waitFor(() => expect(api.updateNotifyRoles).toHaveBeenCalledWith({ manager: ['email', 'telegram'] }));
  });

  it('mutes and adds alerts for one person from their card', async () => {
    vi.spyOn(api, 'updateSmsType').mockImplementation(async (key, payload) => {
      const audience = typeof payload === 'boolean' ? undefined : payload.audience;
      return {
        key,
        audience: { groups: [], users: [], except: [], phones: [], emails: [], ...(audience ?? {}) } as api.AlertAudience,
        audience_custom: true,
        audience_people: { people: [], extras: [], groups: [], note: null },
      };
    });
    renderWithRouter(<PeopleTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Alerts for Ali' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Gets (1)')).toBeTruthy();
    expect(within(dialog).getByText('Muted (1)')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Mute Owner: stock at reorder point' }));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('owner_stock_reorder', { audience: expect.objectContaining({ except: [5], users: [] }) }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Unmute Staff: menu item low stock' }));
    await waitFor(() => expect(api.updateSmsType).toHaveBeenCalledWith('staff_low_stock_menu', { audience: expect.objectContaining({ except: [] }) }));
  });

  it('shows each section only to whoever may change it', async () => {
    grant(['sms.contacts.manage']);
    mockUser.role = 'manager';
    renderWithRouter(<PeopleTab />);
    expect(await screen.findByTestId('extra-numbers')).toBeTruthy();
    expect(screen.queryByTestId('people-list')).toBeNull();
    expect(screen.queryByTestId('notify-channels')).toBeNull();
    expect(api.fetchStaff).not.toHaveBeenCalled();
    expect(api.getNotifyChannels).not.toHaveBeenCalled();
  });
});

describe('Notifications → Log', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchSmsLogs').mockResolvedValue({
      data: [], total: 0, current_page: 1, last_page: 1, per_page: 50,
      totals: { count: 0, segments: 0, cost_mvr: 0, by_status: {} }, types: [],
    });
    vi.spyOn(api, 'fetchStaffNotificationLogs').mockResolvedValue({
      data: [{
        id: 3, order_id: 12, order_number: 'BG-12', order_type: 'online_pickup', event_type: 'new_order', recipient_type: 'staff',
        recipient_id: 4, phone: 'user:4', message: 'New order BG-12', status: 'failed', fallback_used: false, sms_log_id: 9,
        sent_at: null, failed_at: '2026-10-10T10:00:00Z', created_at: '2026-10-10T10:00:00Z',
      }],
      meta: { total: 1, last_page: 1 },
    });
    vi.spyOn(api, 'resendStaffNotification').mockResolvedValue({ message: 'ok', log: {} as api.StaffNotificationLog });
  });

  it('keeps a campaign link narrowed to that campaign', async () => {
    renderWithRouter(<LogTab />, { route: '/notifications/log?campaign_id=6' });
    await waitFor(() => expect(api.fetchSmsLogs).toHaveBeenLastCalledWith(expect.objectContaining({ campaign_id: 6 })));
  });

  it('shows the staff order alerts, says how a phoneless one went, and resends', async () => {
    renderWithRouter(<LogTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Staff order alerts' }));
    const log = await screen.findByTestId('order-alert-log');
    expect(await within(log).findByText('Email / Telegram')).toBeTruthy();
    fireEvent.click(within(log).getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(api.resendStaffNotification).toHaveBeenCalledWith(3));
  });
});

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname}{search}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/notifications/*" element={<NotificationsHub />} />
        <Route path="/sms" element={<SmsPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Notifications hub', () => {
  it('shows each tab only with its permission', async () => {
    grant(['sms.contacts.manage']);
    mockUser.role = 'manager';
    vi.spyOn(api, 'fetchSmsContacts').mockResolvedValue({ contacts: [] });
    renderAt('/notifications');
    expect(await screen.findByTestId('extra-numbers')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Messages' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Log' })).toBeNull();
  });

  it('sends the old SMS settings tabs to their new home', async () => {
    const seen: string[] = [];
    for (const [from, to] of [
      ['/sms?tab=control-center', '/notifications/messages'],
      ['/sms?tab=automations', '/notifications/messages'],
      ['/sms?tab=recipients', '/notifications/people'],
      ['/sms?tab=logs&campaign_id=6', '/notifications/log'],
    ] as const) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[from]}>
          <Routes>
            <Route path="/sms" element={<SmsPage />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );
      const loc = (await screen.findByTestId('location')).textContent ?? '';
      expect(loc.startsWith(to)).toBe(true);
      seen.push(loc);
      unmount();
    }
    expect(seen[3]).toBe('/notifications/log?campaign_id=6');
  });
});
