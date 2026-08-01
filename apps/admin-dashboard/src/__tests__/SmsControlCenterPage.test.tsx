import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { SmsControlCenterPage } from '../pages/SmsControlCenterPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

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
    template: {
      id: 1,
      slug: 'auth_customer_otp',
      body: 'Your code is {{code}}',
      variables: [{ name: 'code' }],
    },
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
    template: {
      id: 2,
      slug: 'giftcard_delivery',
      body: '',
      variables: [{ name: 'amount' }],
    },
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
];

const budgetFixture = {
  monthly_segment_ceiling: 1000,
  per_campaign_segment_ceiling: 200,
  period_start: '2026-08-01',
  period_segments_used: 12,
  period_cost_mvr: 3,
  period_blocked_count: 0,
  monthly_remaining: 988,
  monthly_exhausted: false,
};

const queueFixture = {
  running_campaigns: 0,
  pending_recipients: 0,
  failed_recipients_24h: 0,
  failed_queue_jobs: 0,
  campaigns: [],
};

describe('SmsControlCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.role = 'owner';
    mockCan.mockImplementation((slug?: string) => {
      if (!slug) return true;
      return [
        'sms.settings.manage',
        'sms.templates.edit',
        'sms.logs.view',
        'integrations.sms',
      ].includes(slug);
    });
    vi.spyOn(api, 'getSmsControlCenter').mockResolvedValue({
      global_kill_switch: false,
      demo_mode: true,
      budget: budgetFixture,
      campaign_queue: queueFixture,
      permission_options: [
        { slug: 'sms.campaigns.send', name: 'Send SMS campaigns' },
        { slug: 'sms.transactional.manage', name: 'Manage transactional SMS' },
      ],
      types: typesFixture,
    });
    vi.spyOn(api, 'updateSmsType').mockResolvedValue({ key: 'giftcard_delivery', enabled: false });
    vi.spyOn(api, 'updateSmsGlobalKillSwitch').mockResolvedValue({ global_kill_switch: true });
    vi.spyOn(api, 'updateSmsBudget').mockResolvedValue({ budget: budgetFixture });
  });

  it('renders grouped types', async () => {
    renderWithRouter(<SmsControlCenterPage />);
    expect(await screen.findByRole('heading', { name: 'Auth' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Transactional' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Marketing' })).toBeTruthy();
    expect(screen.getByText('Customer login OTP')).toBeTruthy();
    expect(screen.getByText('Gift card delivery')).toBeTruthy();
    expect(screen.getAllByText(/Always on/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Spend ceiling/i)).toBeTruthy();
    expect(screen.getByText(/Campaign queue health/i)).toBeTruthy();
    expect(screen.getByText(/Gift card recipient phone/)).toBeTruthy();
  });

  it('toggles call the API', async () => {
    renderWithRouter(<SmsControlCenterPage />);
    await screen.findByText('Gift card delivery');
    const toggle = screen.getByLabelText('Toggle Gift card delivery');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(api.updateSmsType).toHaveBeenCalledWith('giftcard_delivery', { enabled: false });
    });
  });

  it('shows kill-switch confirm with OTP warning', async () => {
    renderWithRouter(<SmsControlCenterPage />);
    await screen.findByText(/Global kill switch/i);
    fireEvent.click(screen.getByRole('button', { name: /Global kill switch/i }));
    expect(await screen.findByText(/login OTP codes/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Enable kill switch/i }));
    await waitFor(() => {
      expect(api.updateSmsGlobalKillSwitch).toHaveBeenCalledWith(true);
    });
  });

  it('hides kill switch for non-owners', async () => {
    mockUser.role = 'manager';
    renderWithRouter(<SmsControlCenterPage />);
    await screen.findByText('Customer login OTP');
    expect(screen.queryByRole('button', { name: /Global kill switch/i })).toBeNull();
  });
});
