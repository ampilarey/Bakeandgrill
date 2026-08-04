import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { CartDrawer } from './CartDrawer';
import { FloatingCartBar } from './shell/FloatingCartBar';
import { CartProvider, useCart } from '../context/CartContext';
import { LanguageProvider } from '../context/LanguageContext';
import { ShellNavProvider } from '../context/ShellNavContext';
import { SiteSettingsProvider } from '../context/SiteSettingsContext';
import { ServiceStatusProvider } from '../context/ServiceStatusContext';
import type { Item } from '../api';
import * as api from '../api';
import * as serviceStatusApi from '../api/serviceStatus';
import { cartCheckoutCta } from '../utils/collectOn';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchOnlineOrderingStatus: vi.fn(),
    fetchItems: vi.fn().mockResolvedValue({ data: [] }),
    fetchCartRecommendations: vi.fn().mockResolvedValue({ items: [] }),
    getLoyaltyAccount: vi.fn().mockResolvedValue(null),
    getMyFavourites: vi.fn().mockResolvedValue({ data: [] }),
    getWaitTimeEstimate: vi.fn().mockResolvedValue({ wait_minutes: 0, queue_depth: 0 }),
  };
});

vi.mock('../api/serviceStatus', async () => {
  const actual = await vi.importActual<typeof import('../api/serviceStatus')>('../api/serviceStatus');
  return {
    ...actual,
    fetchServiceStatus: vi.fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

const fetchGate = api.fetchOnlineOrderingStatus as unknown as ReturnType<typeof vi.fn>;
const fetchStatus = serviceStatusApi.fetchServiceStatus as unknown as ReturnType<typeof vi.fn>;

const tomorrowItem: Item = {
  id: 11,
  name: 'Tomorrow Cake',
  description: null,
  base_price: 60,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
  allow_pre_order: true,
};

const todayOnlyItem: Item = {
  id: 12,
  name: 'Today Salad',
  description: null,
  base_price: 40,
  category_id: 1,
  is_available: true,
  has_variants: false,
  variants: [],
  allow_pre_order: false,
};

function buildServices(available = true) {
  const keys = [
    'online_ordering',
    'online_pickup',
    'online_delivery',
    'online_checkout',
    'online_payment',
    'catering_inquiry',
    'customer_registration',
    'marketing_site',
  ];
  const services: Record<string, serviceStatusApi.ServiceStatusEntry> = {};
  for (const k of keys) {
    services[k] = {
      service_key: k,
      group: 'public',
      available,
      status: available ? 'available' : 'unavailable',
      reason_type: available ? null : 'operational_pause',
      public_message: available ? null : 'Paused',
      alternatives: [],
      retry_at: null,
      starts_at: null,
      notify_enabled: true,
      incident_id: null,
    };
  }
  return { services, generated_at: new Date().toISOString() };
}

function SeedCart({ items }: { items: Item[] }) {
  const { addItem, clearCart } = useCart();
  useEffect(() => {
    clearCart();
    items.forEach((item) => addItem(item, 1));
  }, [items, addItem, clearCart]);
  return null;
}

function wrapDrawer(props: {
  isOpen: boolean;
  items: Item[];
  closedMessage?: string;
}) {
  return render(
    <SiteSettingsProvider>
      <LanguageProvider>
        <CartProvider>
          <MemoryRouter>
            <SeedCart items={props.items} />
            <CartDrawer
              isOpen={props.isOpen}
              closedMessage={props.closedMessage}
            />
          </MemoryRouter>
        </CartProvider>
      </LanguageProvider>
    </SiteSettingsProvider>,
  );
}

function wrapFloating(items: Item[]) {
  return render(
    <SiteSettingsProvider>
      <LanguageProvider>
        <ServiceStatusProvider>
          <CartProvider>
            <ShellNavProvider>
              <MemoryRouter>
                <SeedCart items={items} />
                <FloatingCartBar />
              </MemoryRouter>
            </ShellNavProvider>
          </CartProvider>
        </ServiceStatusProvider>
      </LanguageProvider>
    </SiteSettingsProvider>,
  );
}

describe('closed shop → tomorrow checkout CTA', () => {
  beforeEach(() => {
    localStorage.clear();
    navigateMock.mockReset();
    fetchGate.mockReset();
    fetchStatus.mockReset();
    fetchStatus.mockResolvedValue(buildServices(true));
    fetchGate.mockResolvedValue({
      open: false,
      message: 'Closed for tonight',
      reason: 'schedule',
      master_switch: true,
      override_active: false,
      override_until: null,
      schedule_active: true,
      current_close: null,
      next_open_window: '2026-08-05T10:00:00+05:00',
      delivery_available: false,
      next_delivery_window: null,
      order_for_tomorrow: {
        enabled: true,
        collect_tomorrow_date: '2026-08-05',
      },
    });
  });

  it('CartDrawer: closed + all allow_pre_order → enabled tomorrow label', async () => {
    await act(async () => {
      wrapDrawer({ isOpen: false, items: [tomorrowItem], closedMessage: 'Ordering opens at 10:00 AM' });
    });
    const btn = await screen.findByRole('button', { name: /collect tomorrow/i });
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent(/Checkout — collect tomorrow/i);
  });

  it('CartDrawer: closed + mixed cart → disabled reopen message', async () => {
    await act(async () => {
      wrapDrawer({
        isOpen: false,
        items: [tomorrowItem, todayOnlyItem],
        closedMessage: 'Ordering opens at 10:00 AM',
      });
    });
    const btn = await screen.findByRole('button', { name: /Ordering opens at 10:00 AM/i });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole('button', { name: /collect tomorrow/i })).toBeNull();
  });

  it('CartDrawer: closed + empty cart → disabled closed CTA', async () => {
    await act(async () => {
      wrapDrawer({ isOpen: false, items: [] });
    });
    const btn = await screen.findByRole('button', { name: /Ordering is closed/i });
    expect(btn).toBeDisabled();
  });

  it('CartDrawer: shop open → normal checkout (unchanged)', async () => {
    await act(async () => {
      wrapDrawer({ isOpen: true, items: [todayOnlyItem] });
    });
    const btn = await screen.findByRole('button', { name: /Proceed to Checkout/i });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveTextContent(/collect tomorrow/i);
  });

  it('FloatingCartBar/CartSheet agrees with CartDrawer for every case', async () => {
    const user = userEvent.setup();
    const cases: Array<{
      items: Item[];
      shopOpen: boolean;
      expectEnabled: boolean;
      label: RegExp;
    }> = [
      {
        items: [tomorrowItem],
        shopOpen: false,
        expectEnabled: true,
        label: /collect tomorrow/i,
      },
      {
        items: [tomorrowItem, todayOnlyItem],
        shopOpen: false,
        expectEnabled: false,
        label: /Ordering opens at/i,
      },
      {
        items: [todayOnlyItem],
        shopOpen: true,
        expectEnabled: true,
        label: /Proceed to Checkout/i,
      },
    ];

    for (const c of cases) {
      const lines = c.items.map((i) => ({ allow_pre_order: i.allow_pre_order }));
      const derived = cartCheckoutCta({ shopOpen: c.shopOpen, lines });
      expect(derived.canCheckout).toBe(c.expectEnabled);

      fetchGate.mockResolvedValue({
        open: c.shopOpen,
        message: null,
        reason: null,
        master_switch: true,
        override_active: false,
        override_until: null,
        schedule_active: false,
        current_close: null,
        next_open_window: c.shopOpen ? null : '2026-08-05T10:00:00+05:00',
        delivery_available: true,
        next_delivery_window: null,
      });

      const { unmount } = await act(async () => wrapFloating(c.items));

      if (c.items.length === 0) {
        unmount();
        continue;
      }

      await waitFor(() => {
        expect(document.querySelector('.float-cart-fab')).toBeTruthy();
      });
      await user.click(document.querySelector('.float-cart-fab') as HTMLElement);
      const btn = await screen.findByRole('button', { name: c.label });
      if (c.expectEnabled) expect(btn).toBeEnabled();
      else expect(btn).toBeDisabled();
      unmount();
      localStorage.clear();
    }
  });

  it('FloatingCartBar: closed + tomorrow cart navigates to checkout', async () => {
    const user = userEvent.setup();
    await act(async () => {
      wrapFloating([tomorrowItem]);
    });
    await waitFor(() => {
      expect(document.querySelector('.float-cart-fab')).toBeTruthy();
    });
    await user.click(document.querySelector('.float-cart-fab') as HTMLElement);
    const btn = await screen.findByRole('button', { name: /collect tomorrow/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(navigateMock).toHaveBeenCalledWith('/checkout');
  });
});
