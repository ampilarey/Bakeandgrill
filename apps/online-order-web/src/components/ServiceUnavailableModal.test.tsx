import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceUnavailableModal } from './ServiceUnavailableModal';
import {
  ServiceStatusProvider,
  useServiceStatusContext,
} from '../context/ServiceStatusContext';
import { ServiceUnavailableError } from '../api/serviceUnavailable';

vi.mock('../api/serviceStatus', async () => {
  const actual = await vi.importActual<typeof import('../api/serviceStatus')>('../api/serviceStatus');
  return {
    ...actual,
    fetchServiceStatus: vi.fn(async () => ({ services: {}, generated_at: '' })),
  };
});

function Harness({ onCtx }: { onCtx: (ctx: ReturnType<typeof useServiceStatusContext>) => void }) {
  const ctx = useServiceStatusContext();
  onCtx(ctx);
  return <ServiceUnavailableModal />;
}

describe('ServiceUnavailableModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when there is no target', () => {
    render(
      <ServiceStatusProvider>
        <ServiceUnavailableModal />
      </ServiceStatusProvider>
    );
    expect(screen.queryByTestId('service-unavailable-modal')).toBeNull();
  });

  it('opens with alternatives + NotifyMeForm when notify_enabled', async () => {
    let ctx: ReturnType<typeof useServiceStatusContext> | null = null;
    render(
      <ServiceStatusProvider>
        <Harness onCtx={(c) => { ctx = c; }} />
      </ServiceStatusProvider>
    );
    act(() => {
      ctx!.openUnavailableModal({
        serviceKey: 'online_checkout',
        message: 'Checkout paused.',
        alternatives: ['pickup', 'call'],
        retryAt: null,
        notifyEnabled: true,
      });
    });
    const modal = await screen.findByTestId('service-unavailable-modal');
    expect(modal).toHaveTextContent('Checkout paused.');
    expect(modal).toHaveTextContent('online_checkout');
    expect(screen.getByRole('link', { name: /order pickup instead/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /call the caf/i })).toBeInTheDocument();
    expect(screen.getByTestId('notify-me-form')).toBeInTheDocument();
  });

  it('opens automatically when a service_unavailable window event fires', async () => {
    render(
      <ServiceStatusProvider>
        <ServiceUnavailableModal />
      </ServiceStatusProvider>
    );
    act(() => {
      const err = new ServiceUnavailableError({
        code: 'SERVICE_UNAVAILABLE',
        service_key: 'online_payment',
        message: 'Payments offline.',
        alternatives: ['cod'],
        retry_at: null,
        notify_enabled: false,
      });
      window.dispatchEvent(new CustomEvent('service_unavailable', { detail: err }));
    });
    const modal = await screen.findByTestId('service-unavailable-modal');
    expect(modal).toHaveTextContent('Payments offline.');
    // notify form should be hidden when notify_enabled=false
    expect(screen.queryByTestId('notify-me-form')).toBeNull();
  });

  it('closes via the Close button', async () => {
    let ctx: ReturnType<typeof useServiceStatusContext> | null = null;
    render(
      <ServiceStatusProvider>
        <Harness onCtx={(c) => { ctx = c; }} />
      </ServiceStatusProvider>
    );
    act(() => {
      ctx!.openUnavailableModal({
        serviceKey: 'online_checkout',
        message: 'Down.',
        alternatives: [],
        retryAt: null,
        notifyEnabled: false,
      });
    });
    expect(await screen.findByTestId('service-unavailable-modal')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByTestId('service-unavailable-modal')).toBeNull());
  });
});
