import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { DiscountControlsPage } from '../pages/DiscountControlsPage';
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

const controlsFixture: api.DiscountControls = {
  discount_manual_enabled: true,
  discount_max_percent: 25,
  discount_max_fixed_mvr: 50,
  discount_role_caps: { staff: { percent: 10 } },
  discount_reason_required: true,
  discount_reasons: ['Loyal customer', 'Staff meal'],
  discount_approval_required: false,
  discount_approval_approvers: [{ phone: '7900000', label: 'Owner', user_id: 1 }],
  discount_approval_code_ttl_minutes: 10,
  discount_approval_max_attempts: 5,
  discount_margin_floor_enabled: false,
  discount_margin_floor_pct: 0,
  roles_with_discounts: ['Owner', 'Manager'],
  roles_with_override: ['Owner'],
};

describe('DiscountControlsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.role = 'owner';
    mockCan.mockImplementation((slug?: string) => {
      if (!slug) return true;
      return slug === 'discounts.settings.manage';
    });
    vi.spyOn(api, 'getDiscountControls').mockResolvedValue({ ...controlsFixture });
    vi.spyOn(api, 'updateDiscountControls').mockResolvedValue({
      ...controlsFixture,
      discount_manual_enabled: false,
      discount_max_percent: 15,
    });
  });

  it('renders and loads controls', async () => {
    renderWithRouter(<DiscountControlsPage />);
    expect(await screen.findByRole('heading', { name: 'Discount Controls' })).toBeTruthy();
    await waitFor(() => {
      expect(api.getDiscountControls).toHaveBeenCalled();
    });
    expect(await screen.findByText(/Manual discounts enabled/i)).toBeTruthy();
    expect(screen.getByLabelText('Max discount percent')).toHaveValue('25');
    expect(screen.getByDisplayValue('Loyal customer')).toBeTruthy();
    expect(screen.getByText(/Owner, Manager/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Roles & Permissions/i })).toBeTruthy();
  });

  it('saves changes via updateDiscountControls', async () => {
    renderWithRouter(<DiscountControlsPage />);
    await screen.findByText(/Manual discounts enabled/i);

    const switches = screen.getAllByRole('switch');
    // First switch = manual discounts enabled
    fireEvent.click(switches[0]);

    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(api.updateDiscountControls).toHaveBeenCalled();
    });
    const payload = vi.mocked(api.updateDiscountControls).mock.calls[0][0];
    expect(payload.discount_manual_enabled).toBe(false);
    expect(payload.discount_reasons).toEqual(['Loyal customer', 'Staff meal']);
    expect(payload.discount_approval_approvers?.[0]?.phone).toBe('7900000');
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('gates the page without discounts.settings.manage', async () => {
    mockCan.mockImplementation(() => false);
    renderWithRouter(<DiscountControlsPage />);
    expect(await screen.findByText(/discounts\.settings\.manage/i)).toBeTruthy();
    expect(api.getDiscountControls).not.toHaveBeenCalled();
  });
});
