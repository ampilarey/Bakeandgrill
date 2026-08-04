import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { ProductCard } from './menu/ProductCard';
import { ServiceBanner } from './ServiceBanner';
import { FloatingCartBar } from './shell/FloatingCartBar';
import { CartProvider, useCart } from '../context/CartContext';
import { LanguageProvider } from '../context/LanguageContext';
import { ShellNavProvider } from '../context/ShellNavContext';
import { SiteSettingsProvider } from '../context/SiteSettingsContext';
import { ServiceStatusProvider } from '../context/ServiceStatusContext';
import type { Item } from '../api';
import * as api from '../api';
import * as serviceStatusApi from '../api/serviceStatus';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchOnlineOrderingStatus: vi.fn(),
  };
});

vi.mock('../api/serviceStatus', async () => {
  const actual = await vi.importActual<typeof import('../api/serviceStatus')>('../api/serviceStatus');
  return {
    ...actual,
    fetchServiceStatus: vi.fn(),
  };
});

vi.mock('../context/LanguageContext', async () => {
  const actual = await vi.importActual<typeof import('../context/LanguageContext')>('../context/LanguageContext');
  return actual;
});

vi.mock('../utils/itemMedia', () => ({
  buildItemSlides: () => [],
}));

vi.mock('./menu/MenuImageSlider', () => ({
  MenuImageSlider: () => <div data-testid="slider" />,
}));

const fetchGate = api.fetchOnlineOrderingStatus as unknown as ReturnType<typeof vi.fn>;
const fetchStatus = serviceStatusApi.fetchServiceStatus as unknown as ReturnType<typeof vi.fn>;

const sampleItem: Item = {
  id: 42,
  name: 'Grilled Chicken',
  description: 'Smoky',
  base_price: 85,
  category_id: 1,
  is_available: true,
  available_now: true,
  unavailable_reason: null,
  has_variants: false,
  variants: [],
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

function SeedCart({ item }: { item: Item }) {
  const { addItem, clearCart } = useCart();
  useEffect(() => {
    clearCart();
    addItem(item, 1);
  }, [item, addItem, clearCart]);
  return null;
}

describe('browse while ordering gate is closed', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchGate.mockReset();
    fetchStatus.mockReset();
    fetchStatus.mockResolvedValue(buildServices(true));
    fetchGate.mockResolvedValue({
      open: false,
      message: 'Kitchen closed for tonight',
      reason: 'master_switch_off',
      master_switch: false,
      override_active: false,
      override_until: null,
      schedule_active: false,
      current_close: null,
      next_open_window: '2026-08-05T10:00:00+05:00',
      delivery_available: false,
      next_delivery_window: null,
    });
  });

  it('keeps product cards clickable when available_now is true', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    render(
      <ProductCard
        item={sampleItem}
        onSelectItem={onSelectItem}
        onAddToCart={() => {}}
      />,
    );
    const card = screen.getByTestId('product-card');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabIndex', '0');
    await user.click(card);
    expect(onSelectItem).toHaveBeenCalledWith(sampleItem, 1);
  });

  it('shows the closed notice via ServiceBanner when gateClosedMessage is set', () => {
    render(
      <ServiceStatusProvider>
        <ServiceBanner gateClosedMessage="Kitchen closed for tonight · Opens 10:00 AM" />
      </ServiceStatusProvider>,
    );
    expect(screen.getByTestId('service-banner-online_ordering')).toHaveTextContent(
      'Kitchen closed for tonight · Opens 10:00 AM',
    );
  });

  it('still adds items to the cart while the gate is closed', async () => {
    function Probe() {
      const { cart, addItem } = useCart();
      return (
        <div>
          <button type="button" onClick={() => addItem(sampleItem, 1)}>
            Add
          </button>
          <span data-testid="cart-count">{cart.reduce((n, e) => n + e.quantity, 0)}</span>
        </div>
      );
    }
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
  });

  it('shows cart total but CTA does not offer checkout while closed', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <SiteSettingsProvider>
          <LanguageProvider>
            <ServiceStatusProvider>
              <CartProvider>
                <ShellNavProvider>
                  <MemoryRouter>
                    <SeedCart item={sampleItem} />
                    <FloatingCartBar />
                  </MemoryRouter>
                </ShellNavProvider>
              </CartProvider>
            </ServiceStatusProvider>
          </LanguageProvider>
        </SiteSettingsProvider>,
      );
    });

    await waitFor(() => {
      expect(document.querySelector('.float-cart-fab')).toBeTruthy();
    });
    expect(screen.getByText('85/-')).toBeTruthy();

    await user.click(document.querySelector('.float-cart-fab') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ordering opens at/i })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /Proceed to Checkout/i })).toBeNull();
    const cta = screen.getByRole('button', { name: /Ordering opens at/i });
    expect(cta).toBeDisabled();
  });
});
