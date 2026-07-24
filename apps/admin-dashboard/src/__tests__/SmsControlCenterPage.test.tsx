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

const typesFixture = [
  {
    key: 'auth_customer_otp',
    label: 'Customer login OTP',
    category: 'auth' as const,
    enabled: true,
    always_on: true,
    suppressible: false,
    send_permission: null,
    send_permission_label: 'System',
    roles_with_permission: ['System'],
    template: {
      id: 1,
      slug: 'auth_customer_otp',
      body: 'Your code is {{code}}',
      variables: [{ name: 'code' }],
    },
    last_30_days: { count: 3, cost_mvr: 0.75 },
  },
  {
    key: 'giftcard_delivery',
    label: 'Gift card delivery',
    category: 'transactional' as const,
    enabled: true,
    always_on: false,
    suppressible: false,
    send_permission: 'sms.transactional.manage',
    send_permission_label: 'Manage transactional SMS',
    roles_with_permission: ['Owner', 'Manager'],
    template: {
      id: 2,
      slug: 'giftcard_delivery',
      body: '',
      variables: [{ name: 'amount' }],
    },
    last_30_days: { count: 1, cost_mvr: 0.25 },
  },
  {
    key: 'marketing_campaign',
    label: 'Bulk campaign',
    category: 'marketing' as const,
    enabled: true,
    always_on: false,
    suppressible: true,
    send_permission: 'sms.campaigns.send',
    send_permission_label: 'Send SMS campaigns',
    roles_with_permission: ['Owner'],
    template: null,
    last_30_days: { count: 0, cost_mvr: 0 },
  },
];

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
      types: typesFixture,
    });
    vi.spyOn(api, 'updateSmsType').mockResolvedValue({ key: 'giftcard_delivery', enabled: false });
    vi.spyOn(api, 'updateSmsGlobalKillSwitch').mockResolvedValue({ global_kill_switch: true });
  });

  it('renders grouped types', async () => {
    renderWithRouter(<SmsControlCenterPage />);
    expect(await screen.findByRole('heading', { name: 'Auth' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Transactional' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Marketing' })).toBeTruthy();
    expect(screen.getByText('Customer login OTP')).toBeTruthy();
    expect(screen.getByText('Gift card delivery')).toBeTruthy();
    expect(screen.getAllByText(/Always on/i).length).toBeGreaterThan(0);
  });

  it('toggles call the API', async () => {
    renderWithRouter(<SmsControlCenterPage />);
    await screen.findByText('Gift card delivery');
    const toggle = screen.getByLabelText('Toggle Gift card delivery');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(api.updateSmsType).toHaveBeenCalledWith('giftcard_delivery', false);
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

  it('disables toggles without settings permission', async () => {
    mockCan.mockImplementation((slug?: string) => slug === 'sms.logs.view');
    renderWithRouter(<SmsControlCenterPage />);
    await screen.findByText('Gift card delivery');
    const toggle = screen.getByLabelText('Toggle Gift card delivery') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });
});
