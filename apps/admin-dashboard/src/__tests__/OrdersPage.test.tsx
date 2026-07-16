import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { OrdersPage } from '../pages/OrdersPage';
import { renderWithRouter } from './testUtils';

const { heldOrder } = vi.hoisted(() => ({
  heldOrder: {
    id: 42,
    order_number: 'ORD-42',
    status: 'held',
    type: 'dine_in',
    total: 100,
    created_at: new Date().toISOString(),
  },
}));

vi.mock('../hooks/useSse', () => ({
  useSse: () => ({ connected: true }),
}));

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: (slug?: string) => slug === 'pos.hold_resume' || slug === 'orders.manage' || slug === 'orders.view',
    user: null,
    loading: false,
  }),
}));

vi.mock('../api', () => ({
  fetchOrders: vi.fn().mockResolvedValue({
    data: [heldOrder],
    meta: { last_page: 1 },
  }),
  fetchOrder: vi.fn().mockResolvedValue({ order: heldOrder }),
  fetchPosStaffOptions: vi.fn().mockResolvedValue({ staff: [] }),
  fetchDevices: vi.fn().mockResolvedValue({ data: [] }),
  fetchDeliveryDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  resumeOrder: vi.fn(),
  sendOrderBill: vi.fn(),
  addOrderPayments: vi.fn(),
  getReceiptLinkForOrder: vi.fn(),
  sendReceiptForOrder: vi.fn(),
  createInvoiceFromOrder: vi.fn(),
  sendInvoiceToCustomer: vi.fn(),
  assignDeliveryDriver: vi.fn(),
}));

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes kitchen execution and hold actions', async () => {
    renderWithRouter(<OrdersPage />);
    await screen.findByText('#ORD-42');
    expect(screen.queryByRole('button', { name: /Start Preparing/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark Ready/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hold$/i })).toBeNull();
  });

  it('shows POS/KDS pointer and Export CSV', async () => {
    renderWithRouter(<OrdersPage />);
    expect(screen.getByText(/Kitchen prep and register actions run on the/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeTruthy();
  });

  it('shows Resume for held order in drawer', async () => {
    renderWithRouter(<OrdersPage />);
    await screen.findByText('#ORD-42');
    fireEvent.click(screen.getByRole('button', { name: /View/i }));
    expect(await screen.findByRole('button', { name: /Resume Order/i })).toBeTruthy();
  });

  it('shows row quick Resume for held orders', async () => {
    renderWithRouter(<OrdersPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /▶ Resume/i })).toBeTruthy();
    });
  });
});
