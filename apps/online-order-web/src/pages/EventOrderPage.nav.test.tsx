import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { EventOrderPage } from './EventOrderPage';

const authState = { isAuthenticated: false, customerName: null as string | null, setAuth: vi.fn() };
const createEventOrder = vi.fn();

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('../api', () => ({
  fetchItems: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('../api/eventOrders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/eventOrders')>();
  return {
    ...actual,
    createEventOrder: (...args: unknown[]) => createEventOrder(...args),
  };
});
vi.mock('../api/auth', () => ({
  getCustomerMe: vi.fn().mockResolvedValue({ customer: { name: 'Aisha', phone: '7777001' } }),
}));
vi.mock('../components/AuthBlock', () => ({ AuthBlock: () => null }));
vi.mock('../components/shell/PageHeader', () => ({
  PageHeader: ({ title, right }: { title: string; right?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {right}
    </header>
  ),
}));

describe('EventOrderPage discoverability', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.customerName = null;
    createEventOrder.mockReset();
    createEventOrder.mockResolvedValue({ request: { reference: 'EVT-TEST-1' } });
  });

  it('always shows My events nav (sign-in happens on that page if needed)', async () => {
    render(
      <MemoryRouter>
        <EventOrderPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('events-nav')).toBeTruthy());
    expect(screen.getByTestId('my-events-nav')).toBeTruthy();
  });

  it('shows My events nav when authenticated', async () => {
    authState.isAuthenticated = true;
    authState.customerName = 'Aisha';
    render(
      <MemoryRouter>
        <EventOrderPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('my-events-nav')).toBeTruthy());
  });

  it('shows View my events on the done screen', async () => {
    const user = userEvent.setup();
    authState.isAuthenticated = true;
    authState.customerName = 'Aisha';
    render(
      <MemoryRouter>
        <EventOrderPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('event-tab-custom')).toBeTruthy());
    await user.click(screen.getByTestId('event-tab-custom'));
    await user.type(screen.getByTestId('custom-name'), 'Wedding cake');
    await user.click(screen.getByTestId('custom-add'));
    await user.click(screen.getByRole('button', { name: /Continue to event details/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Review & confirm/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Review & confirm/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit event request/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /Submit event request/i }));
    await waitFor(() => expect(screen.getByTestId('view-my-events')).toBeTruthy());
    expect(screen.getByTestId('event-reference').textContent).toContain('EVT-TEST-1');
  });
});
