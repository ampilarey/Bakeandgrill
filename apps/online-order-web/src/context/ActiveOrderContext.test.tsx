import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveOrderProvider,
  sameActiveOrder,
  useActiveOrder,
} from './ActiveOrderContext';
import * as api from '../api';
import type { Order } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCustomerOrders: vi.fn(),
  };
});

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    customerName: 'Aisha',
    authReady: true,
    setAuth: () => {},
    clearAuth: () => {},
  }),
}));

const fetchMock = vi.mocked(api.fetchCustomerOrders);

const activeOrder: Order = {
  id: 42,
  status: 'preparing',
  order_number: 'BG-42',
} as Order;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/']}>
      <ActiveOrderProvider>{children}</ActiveOrderProvider>
    </MemoryRouter>
  );
}

describe('sameActiveOrder', () => {
  it('treats matching id+status as stable', () => {
    expect(sameActiveOrder(activeOrder, { ...activeOrder })).toBe(true);
    expect(sameActiveOrder(activeOrder, { ...activeOrder, status: 'ready' })).toBe(false);
    expect(sameActiveOrder(null, null)).toBe(true);
    expect(sameActiveOrder(undefined, null)).toBe(false);
  });
});

describe('ActiveOrderProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ignores gift_card purchases for the active capsule', async () => {
    fetchMock.mockResolvedValue({
      data: [
        { id: 9, status: 'paid', type: 'gift_card', order_number: 'GC-9' },
        activeOrder,
      ],
    } as never);

    const { result } = renderHook(() => useActiveOrder(), { wrapper });

    await waitFor(() => {
      expect(result.current.activeOrder?.id).toBe(42);
    });
    expect(result.current.activeOrder?.type).not.toBe('gift_card');
    expect(result.current.activeOrderCount).toBe(1);
  });

  it('does not schedule an immediate refetch when an active order resolves', async () => {
    fetchMock.mockResolvedValue({ data: [activeOrder] } as never);

    const { result } = renderHook(() => useActiveOrder(), { wrapper });

    await waitFor(() => {
      expect(result.current.activeOrder?.id).toBe(42);
    });

    const callsAfterResolve = fetchMock.mock.calls.length;
    expect(callsAfterResolve).toBeGreaterThanOrEqual(1);

    // Allow microtasks / effect flushes — must NOT climb from a self-trigger loop
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchMock.mock.calls.length).toBe(callsAfterResolve);
  });
});
