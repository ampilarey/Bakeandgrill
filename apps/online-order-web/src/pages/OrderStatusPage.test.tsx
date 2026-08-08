import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../api';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  authReady: false,
}));

const getOrderDetailMock = vi.hoisted(() => vi.fn());
const getOrderByTrackingTokenMock = vi.hoisted(() => vi.fn());

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    authReady: authState.authReady,
    customerName: authState.isAuthenticated ? 'Test' : null,
    setAuth: () => undefined,
    clearAuth: () => undefined,
  }),
}));

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    clearCart: vi.fn(),
    addItem: vi.fn(),
    items: [],
  }),
}));

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettings: () => ({
    site_name: 'Bake & Grill',
    business_whatsapp: '',
    business_viber: '',
  }),
}));

vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, enabled: false, enable: vi.fn() }),
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getOrderDetail: (...args: unknown[]) => getOrderDetailMock(...args),
    getOrderByTrackingToken: (...args: unknown[]) => getOrderByTrackingTokenMock(...args),
    getWaitTimeEstimate: vi.fn(async () => ({ wait_minutes: 0, queue_depth: 0 })),
    getMyReferralCode: vi.fn(async () => ({ code: null })),
    getReorderPayload: vi.fn(),
    initiateOnlinePayment: vi.fn(),
    initiatePartialPayment: vi.fn(),
  };
});

import { OrderStatusPage } from './OrderStatusPage';
import { LanguageProvider } from '../context/LanguageContext';

const sampleOrder: OrderDetail = {
  id: 42,
  order_number: 'BG-10042',
  status: 'preparing',
  type: 'online_pickup',
  payment_status: 'paid',
  total: 120,
  total_laar: 12000,
  subtotal: 120,
  tax_amount: 0,
  discount_amount: 0,
  delivery_fee: 0,
  items: [
    {
      id: 1,
      item_id: 9,
      item_name: 'Chicken Wrap',
      name: 'Chicken Wrap',
      quantity: 1,
      unit_price: 120,
      total_price: 120,
      notes: null,
      modifiers: [],
    },
  ],
  created_at: '2026-08-08T10:00:00Z',
  updated_at: '2026-08-08T10:05:00Z',
} as unknown as OrderDetail;

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderStatusPage />} />
          <Route path="/track/:trackingToken" element={<OrderStatusPage />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('OrderStatusPage error banner', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.authReady = false;
    getOrderDetailMock.mockReset();
    getOrderByTrackingTokenMock.mockReset();
    // Avoid SSE noise
    vi.stubGlobal(
      'EventSource',
      class {
        close() {}
        addEventListener() {}
        removeEventListener() {}
        onmessage = null;
        onerror = null;
        onopen = null;
        readyState = 0;
        url = '';
        withCredentials = false;
        CONNECTING = 0;
        OPEN = 1;
        CLOSED = 2;
        dispatchEvent() {
          return true;
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('no tracking token, auth NOT ready → loading, not the error banner', async () => {
    authState.authReady = false;
    authState.isAuthenticated = false;

    mount('/orders/42');

    expect(screen.getByTestId('order-status-loading')).toBeTruthy();
    expect(screen.queryByTestId('order-status-error')).toBeNull();
    expect(screen.queryByText(/Open the full link from your SMS/i)).toBeNull();
    expect(getOrderDetailMock).not.toHaveBeenCalled();
  });

  it('no tracking token, auth ready + authenticated → order with NO error banner', async () => {
    authState.authReady = true;
    authState.isAuthenticated = true;
    getOrderDetailMock.mockResolvedValueOnce({ order: sampleOrder });

    mount('/orders/42');

    await waitFor(() => {
      expect(screen.getByTestId('order-status-content')).toBeTruthy();
    });
    expect(screen.queryByTestId('order-status-error')).toBeNull();
    expect(screen.queryByText(/Couldn't load your order/i)).toBeNull();
    expect(screen.getAllByText(/BG-10042/).length).toBeGreaterThan(0);
  });

  it('no tracking token, auth ready + NOT authenticated → need-link error shows', async () => {
    authState.authReady = true;
    authState.isAuthenticated = false;

    mount('/orders/42');

    await waitFor(() => {
      expect(screen.getByTestId('order-status-error')).toBeTruthy();
    });
    expect(screen.getByText(/Open the full link from your SMS, or log in/i)).toBeTruthy();
    expect(screen.queryByTestId('order-status-content')).toBeNull();
    expect(getOrderDetailMock).not.toHaveBeenCalled();
  });

  it('failed poll after success then recovered poll → banner appears then disappears', async () => {
    authState.authReady = true;
    authState.isAuthenticated = true;
    getOrderDetailMock.mockResolvedValue({ order: sampleOrder });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount('/orders/42');

    await waitFor(() => {
      expect(screen.getByTestId('order-status-content')).toBeTruthy();
    });
    expect(screen.queryByTestId('order-status-error')).toBeNull();

    getOrderDetailMock.mockRejectedValueOnce(new Error('Network down'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('order-status-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('order-status-content')).toBeNull();
    expect(screen.getByText('Network down')).toBeTruthy();

    getOrderDetailMock.mockResolvedValueOnce({ order: sampleOrder });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('order-status-content')).toBeTruthy();
    });
    expect(screen.queryByTestId('order-status-error')).toBeNull();

    // During the failed-poll window, banner and content must not coexist.
    expect(
      !!screen.queryByTestId('order-status-error')
      && !!screen.queryByTestId('order-status-content'),
    ).toBe(false);
  });

  it('order content and error banner are never rendered simultaneously', async () => {
    authState.authReady = true;
    authState.isAuthenticated = true;
    getOrderDetailMock.mockResolvedValue({ order: sampleOrder });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount('/orders/42');

    await waitFor(() => {
      expect(screen.getByTestId('order-status-content')).toBeTruthy();
    });
    expect(screen.queryByTestId('order-status-error')).toBeNull();

    getOrderDetailMock.mockRejectedValueOnce(new Error('Transient'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('order-status-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('order-status-content')).toBeNull();
  });

  it('tracking-token path loads without login and shows no banner', async () => {
    authState.authReady = false;
    authState.isAuthenticated = false;
    getOrderByTrackingTokenMock.mockResolvedValueOnce({ order: sampleOrder });

    mount('/track/abc-track-token');

    await waitFor(() => {
      expect(screen.getByTestId('order-status-content')).toBeTruthy();
    });
    expect(getOrderByTrackingTokenMock).toHaveBeenCalledWith('abc-track-token');
    expect(getOrderDetailMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('order-status-error')).toBeNull();
    expect(screen.getAllByText(/BG-10042/).length).toBeGreaterThan(0);
  });
});
