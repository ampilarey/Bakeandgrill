import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Customer360Drawer } from '../components/Customer360Drawer';
import * as api from '../api';
import * as permsHook from '../hooks/usePermissions';

describe('Customer360Drawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(permsHook, 'useCurrentUserPermissions').mockReturnValue({
      user: { id: 1, name: 'Owner', role: 'owner', permissions: ['integrations.sms'] } as never,
      loading: false,
      can: (slug?: string) => slug === 'integrations.sms',
    });
    vi.spyOn(api, 'fetchCustomerActivity').mockResolvedValue({ timeline: [] });
    vi.spyOn(api, 'fetchCustomerGrowthSummary').mockResolvedValue({
      summary: {
        profile: { id: 1, name: 'Test User', phone: '+9607972434' },
        lifetime: {
          paid_orders_count: 2,
          total_paid_spend: 150,
          average_order_value: 75,
          first_order_at: null,
          last_order_at: null,
          days_since_last_order: null,
        },
        favourite_items: [],
        most_used_order_type: null,
        loyalty: {},
        credit: null,
        referral: { codes_count: 0, redemptions_as_referee: 0 },
        reviews: { count: 0, average_rating: 0 },
        sms: { opt_out: true, messages_sent: 0, last_sent_at: null },
        tags: [],
        follow_up_notes: [],
        badges: [],
      },
    });
  });

  it('shows SMS opt-out warning when customer opted out', async () => {
    render(<Customer360Drawer customerId={1} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/opted out of SMS/i)).toBeTruthy();
    });

    const sendBtn = screen.getByRole('button', { name: /send SMS/i }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });
});
