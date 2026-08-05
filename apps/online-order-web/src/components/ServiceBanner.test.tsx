import { render, screen } from '@testing-library/react';
import { ServiceBanner } from './ServiceBanner';
import { ServiceStatusProvider } from '../context/ServiceStatusContext';
import * as serviceStatusApi from '../api/serviceStatus';

vi.mock('../api/serviceStatus', async () => {
  const actual = await vi.importActual<typeof import('../api/serviceStatus')>('../api/serviceStatus');
  return {
    ...actual,
    fetchServiceStatus: vi.fn(),
  };
});

const mocked = serviceStatusApi.fetchServiceStatus as unknown as ReturnType<typeof vi.fn>;

function buildServices(overrides: Record<string, Partial<serviceStatusApi.ServiceStatusEntry>> = {}) {
  const base = (key: string, available = true): serviceStatusApi.ServiceStatusEntry => ({
    service_key: key,
    group: 'public',
    available,
    status: available ? 'available' : 'unavailable',
    reason_type: null,
    public_message: null,
    alternatives: [],
    retry_at: null,
    starts_at: null,
    notify_enabled: true,
    incident_id: null,
  });
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
    services[k] = { ...base(k), ...(overrides[k] ?? {}) };
  }
  return { services, generated_at: new Date().toISOString() };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe('ServiceBanner', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('renders nothing when everything is available', async () => {
    mocked.mockResolvedValue(buildServices());
    const { container } = render(
      <ServiceStatusProvider>
        <ServiceBanner />
      </ServiceStatusProvider>
    );
    await flush();
    expect(container.querySelector('[data-testid^="service-banner-"]')).toBeNull();
  });

  it('shows checkout maintenance banner with public message and alternatives', async () => {
    mocked.mockResolvedValue(
      buildServices({
        online_checkout: {
          available: false,
          status: 'unavailable',
          public_message: 'Online ordering paused for updates',
          alternatives: ['pickup', 'call'],
        },
      })
    );
    render(
      <ServiceStatusProvider>
        <ServiceBanner />
      </ServiceStatusProvider>
    );
    await flush();
    const banner = await screen.findByTestId('service-banner-online_checkout');
    expect(banner).toHaveTextContent('Online ordering paused for updates');
    expect(banner).toHaveTextContent('pickup');
    expect(banner).toHaveTextContent('call');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('shows forced gateClosedMessage for the online_ordering banner', async () => {
    mocked.mockResolvedValue(buildServices());
    render(
      <ServiceStatusProvider>
        <ServiceBanner gateClosedMessage="Shop closed · Opens 9:00 AM" />
      </ServiceStatusProvider>
    );
    await flush();
    const banner = screen.getByTestId('service-banner-online_ordering');
    expect(banner).toHaveTextContent('Shop closed · Opens 9:00 AM');
  });

  it('respects banner priority: online_ordering (umbrella) wins over online_delivery', async () => {
    mocked.mockResolvedValue(
      buildServices({
        online_ordering: { available: false },
        online_delivery: { available: false },
      })
    );
    render(
      <ServiceStatusProvider>
        <ServiceBanner />
      </ServiceStatusProvider>
    );
    await flush();
    expect(await screen.findByTestId('service-banner-online_ordering')).toBeInTheDocument();
    expect(screen.queryByTestId('service-banner-online_delivery')).toBeNull();
  });

  it('never banners a delivery-only outage — shown contextually in the mode sheet instead', async () => {
    mocked.mockResolvedValue(
      buildServices({
        online_delivery: {
          available: false,
          status: 'unavailable',
          public_message: 'Delivery is not available at this time. Please check our delivery hours.',
        },
      })
    );
    const { container } = render(
      <ServiceStatusProvider>
        <ServiceBanner />
      </ServiceStatusProvider>
    );
    await flush();
    expect(container.querySelector('[data-testid^="service-banner-"]')).toBeNull();
  });
});
