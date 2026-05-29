import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomerGrowthPage } from '../pages/CustomerGrowthPage';
import * as api from '../api';
import * as permsHook from '../hooks/usePermissions';

describe('CustomerGrowthPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(permsHook, 'useCurrentUserPermissions').mockReturnValue({
      user: { id: 1, name: 'Owner', role: 'owner', permissions: ['customers.analytics', 'customers.manage'] } as never,
      loading: false,
      can: () => true,
    });
    vi.spyOn(api, 'fetchCustomerSegments').mockResolvedValue({
      segments: [{ slug: 'vip_customers', label: 'VIP', count: 3 }],
    });
    vi.spyOn(api, 'fetchCustomerGrowthMetrics').mockResolvedValue({
      metrics: {
        total_customers: 120,
        new_customers_today: 2,
        new_customers_7d: 10,
        new_customers_30d: 25,
        active_customers_30d: 40,
        active_customers_90d: 70,
        customers_with_paid_orders: 80,
        returning_customers: 35,
        repeat_rate: 44,
        total_paid_orders: 200,
        total_paid_revenue: 50000,
        average_order_value: 250,
        average_lifetime_value: 625,
        dormant_30d: 12,
        dormant_60d: 8,
        dormant_90d: 5,
        sms_opt_in_count: 90,
        sms_opt_out_count: 10,
        incomplete_profile_count: 6,
        approved_credit_customers: 4,
        total_credit_balance: 1000,
        overdue_credit_customers: 1,
        trends: [],
      },
    });
  });

  it('renders overview metric cards from API', async () => {
    render(
      <MemoryRouter>
        <CustomerGrowthPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Total customers')).toBeTruthy();
      expect(screen.getByText('120')).toBeTruthy();
      expect(screen.getByText('Repeat rate')).toBeTruthy();
      expect(screen.getByText('44%')).toBeTruthy();
    });
  });
});
