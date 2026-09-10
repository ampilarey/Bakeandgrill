import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { KitchenRoutingTab } from '../pages/KitchenRoutingTab';

/*
 * Owner, 2026-09-09, on a kitchen board showing 77 tickets: "the items that
 * are shown in this is already prepared items, sold and paid via pos", then
 * "this page should show only the items that are active orders".
 *
 * This is the switch. A group left on behaves exactly as before, so the screen
 * has to make the two states unmistakable — a manager reading it should not
 * have to guess which way round the button is.
 */

const fetchMenuGroups = vi.fn();
const setMenuGroupKitchenRouting = vi.fn();
let canReturn = true;

vi.mock('../api', () => ({
  fetchMenuGroups: (...a: unknown[]) => fetchMenuGroups(...a),
  setMenuGroupKitchenRouting: (...a: unknown[]) => setMenuGroupKitchenRouting(...a),
}));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => canReturn, loading: false, user: null }),
}));

const grill = { id: 1, name: 'Grill', slug: 'grill', sort_order: 1, is_active: true, goes_to_kitchen: true };
const counter = { id: 2, name: 'Counter', slug: 'counter', sort_order: 2, is_active: true, goes_to_kitchen: false };

describe('Choosing what the kitchen makes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canReturn = true;
    fetchMenuGroups.mockResolvedValue({ data: [grill, counter] });
    setMenuGroupKitchenRouting.mockResolvedValue({ menu_group: { ...counter, goes_to_kitchen: true } });
  });

  it('says what each state actually does, not just on and off', async () => {
    render(<KitchenRoutingTab />);

    const on = await screen.findByTestId('kitchen-routing-1');
    expect(on).toHaveTextContent(/prints a chit, shows on the kitchen board/);

    const off = screen.getByTestId('kitchen-routing-2');
    expect(off).toHaveTextContent(/no chit, never reaches the board/);
  });

  it('takes a group off the kitchen board', async () => {
    render(<KitchenRoutingTab />);
    const row = await screen.findByTestId('kitchen-routing-1');

    fireEvent.click(within(row).getByLabelText('Stop sending Grill to the kitchen'));

    await waitFor(() => expect(setMenuGroupKitchenRouting).toHaveBeenCalledWith(1, false));
  });

  it('puts one back', async () => {
    render(<KitchenRoutingTab />);
    const row = await screen.findByTestId('kitchen-routing-2');

    fireEvent.click(within(row).getByLabelText('Send Counter to the kitchen'));

    await waitFor(() => expect(setMenuGroupKitchenRouting).toHaveBeenCalledWith(2, true));
  });

  it('treats a group with no answer yet as going to the kitchen', async () => {
    // Rows saved before the column existed come back without the field, and
    // the honest reading is the old behaviour rather than a silent "no".
    fetchMenuGroups.mockResolvedValue({
      data: [{ id: 3, name: 'Old', slug: 'old', sort_order: 1, is_active: true }],
    });
    render(<KitchenRoutingTab />);

    expect(await screen.findByTestId('kitchen-routing-3'))
      .toHaveTextContent(/prints a chit/);
  });

  it('says how many groups are off the board', async () => {
    render(<KitchenRoutingTab />);

    expect(await screen.findByText(/1 group is off the kitchen board/)).toBeInTheDocument();
  });

  it('says nothing about it when every group goes to the kitchen', async () => {
    fetchMenuGroups.mockResolvedValue({ data: [grill] });
    render(<KitchenRoutingTab />);

    await screen.findByTestId('kitchen-routing-1');
    expect(screen.queryByText(/off the kitchen board/)).toBeNull();
  });

  it('snaps back and says so when the save fails', async () => {
    setMenuGroupKitchenRouting.mockRejectedValue(new Error('Server said no'));
    render(<KitchenRoutingTab />);
    const row = await screen.findByTestId('kitchen-routing-1');

    fireEvent.click(within(row).getByLabelText('Stop sending Grill to the kitchen'));

    expect(await screen.findByText('Server said no')).toBeInTheDocument();
    // Re-read from the server, so the switch shows what is actually stored.
    await waitFor(() => expect(screen.getByTestId('kitchen-routing-1')).toHaveTextContent(/prints a chit/));
  });

  it('is read-only for somebody who cannot manage the menu', async () => {
    canReturn = false;
    render(<KitchenRoutingTab />);

    await screen.findByTestId('kitchen-routing-1');
    expect(screen.queryByLabelText(/Stop sending Grill/)).toBeNull();
    // Still readable: knowing how it is set is not the same as changing it.
    expect(screen.getByTestId('kitchen-routing-1')).toHaveTextContent('Grill');
  });
});
