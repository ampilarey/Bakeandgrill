import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StaffUser } from '../api';

const { state } = vi.hoisted(() => ({ state: { user: null as unknown } }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ user: state.user, loading: false, can: () => true }),
}));

import HelpPage from './HelpPage';

const owner = { id: 1, name: 'Owner', role: 'owner', permissions: [] } as unknown as StaffUser;
const cashier = { id: 2, name: 'Cashier', role: 'cashier', permissions: ['orders.view'] } as unknown as StaffUser;

function show(path: string, user: StaffUser) {
  state.user = user;
  return render(<MemoryRouter initialEntries={[path]}><HelpPage /></MemoryRouter>);
}

/* Owner, 2026-11-10: "lots of different features that I don't know how to use". */
describe('HelpPage', () => {
  it('lists the guides by page and opens one with its steps and a button to the screen', () => {
    show('/help', owner);
    expect(screen.getByTestId('help-group-/promotions')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Give the first 50 customers a discount or a free item'));
    expect(screen.getByText(/Type 50 in "Max uses \(all customers\)" and 1 in "Uses per customer"\./)).toBeInTheDocument();
    expect(screen.getByTestId('guide-open-offer-first-customers')).toHaveAttribute('href', '/promotions/offers');
  });

  it('searches by a few words', () => {
    show('/help', owner);
    fireEvent.change(screen.getByTestId('help-search'), { target: { value: 'sold out' } });
    expect(screen.getByTestId('guide-menu-sold-out')).toBeInTheDocument();
    expect(screen.queryByTestId('guide-offer-code')).toBeNull();
    fireEvent.change(screen.getByTestId('help-search'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No guide matches/)).toBeInTheDocument();
  });

  it('puts the guides of the page you came from first', () => {
    show('/help?page=%2Fshifts', owner);
    const first = screen.getByTestId('help-for-page');
    expect(first).toHaveTextContent('On Shifts & Cash');
    expect(first).toHaveTextContent('Read the shift history and the cash difference');
    expect(screen.getByTestId('help-group-/promotions')).toBeInTheDocument();
  });

  it('shows only the guides of pages the person may open', () => {
    show('/help', cashier);
    expect(screen.queryByTestId('help-group-/promotions')).toBeNull();
    expect(screen.queryByTestId('help-group-/finance')).toBeNull();
    expect(screen.getByTestId('help-group-/tables')).toBeInTheDocument();
  });
});
