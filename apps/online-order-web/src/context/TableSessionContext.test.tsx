import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OrderModeProvider, useOrderMode } from './OrderModeContext';
import { TableSessionProvider, useSeatedTable } from './TableSessionContext';
import * as orders from '../api/orders';

vi.mock('../api/orders', async () => {
  const actual = await vi.importActual<typeof import('../api/orders')>('../api/orders');
  return { ...actual, lookupTableByQr: vi.fn() };
});

const lookup = () => orders.lookupTableByQr as unknown as ReturnType<typeof vi.fn>;
const TOKEN = 'c'.repeat(24);

function Probe() {
  const { mode, modeConfirmed } = useOrderMode();
  const seated = useSeatedTable();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="confirmed">{String(modeConfirmed)}</span>
      <span data-testid="table">{seated.name ?? ''}</span>
      <span data-testid="error">{seated.error}</span>
    </div>
  );
}

/**
 * Owner, 2026-10-12: a scan opened the home page, the guest tapped Menu, and
 * by checkout the table was gone, because only the checkout page read the
 * link. The app now reads the scan once, on arrival, and a confirmed table
 * settles the order mode.
 */
describe('TableSessionProvider', () => {
  const setUrl = (search: string) => window.history.replaceState({}, '', `/${search}`);

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    setUrl('');
  });
  afterEach(() => setUrl(''));

  it('reads the scan on any page, keeps it for the visit and settles on eating here', async () => {
    lookup().mockResolvedValue({ table: { name: 'T4', location: null } });
    setUrl(`?table=${TOKEN}`);

    render(
      <OrderModeProvider>
        <TableSessionProvider>
          <Probe />
        </TableSessionProvider>
      </OrderModeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('table').textContent).toBe('T4'));
    expect(lookup()).toHaveBeenCalledWith(TOKEN);
    expect(sessionStorage.getItem('bg_table_token')).toBe(TOKEN);
    // The first Add asks nothing: the mode is eat here, and it counts as chosen.
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('dine_in'));
    expect(screen.getByTestId('confirmed').textContent).toBe('true');
  });

  it('leaves the mode alone and says so when the code is not in use', async () => {
    lookup().mockRejectedValue(new Error('not found'));
    setUrl(`?table=${TOKEN}`);

    render(
      <OrderModeProvider>
        <TableSessionProvider>
          <Probe />
        </TableSessionProvider>
      </OrderModeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('error').textContent).toContain('not in use'));
    expect(screen.getByTestId('table').textContent).toBe('');
    expect(screen.getByTestId('mode').textContent).toBe('pickup');
    expect(screen.getByTestId('confirmed').textContent).toBe('false');
  });

  it('does nothing when nobody scanned', async () => {
    render(
      <OrderModeProvider>
        <TableSessionProvider>
          <Probe />
        </TableSessionProvider>
      </OrderModeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('pickup'));
    expect(lookup()).not.toHaveBeenCalled();
  });
});
