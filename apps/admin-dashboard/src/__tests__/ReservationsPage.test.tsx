import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ReservationsPage } from '../pages/ReservationsPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

/* Ops audit, 2026-09-25: staff can take a booking by phone from the dashboard. */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getReservations').mockResolvedValue({ data: [], meta: { total: 0, current_page: 1, last_page: 1 } });
  vi.spyOn(api, 'createAdminReservation').mockResolvedValue({
    reservation: {
      id: 9, customer_name: 'Aisha', customer_phone: '+9607771234', party_size: 4, date: '2026-10-02', time_slot: '19:00',
      duration_minutes: 30, status: 'confirmed', notes: 'Window seat', table: { id: 1, name: 'Hall A' }, tracking_token: null, created_at: '2026-09-25T10:00:00+05:00',
    },
  });
});

describe('ReservationsPage — booking by phone', () => {
  it('takes a booking, confirmed on the spot, and reloads the list', async () => {
    renderWithRouter(<ReservationsPage />);
    fireEvent.click(await screen.findByText('+ New booking'));
    fireEvent.change(screen.getByLabelText('Guest name'), { target: { value: 'Aisha' } });
    fireEvent.change(screen.getByLabelText('Guest phone'), { target: { value: '7771234' } });
    fireEvent.change(screen.getByLabelText('Party size'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Booking date'), { target: { value: '2026-10-02' } });
    fireEvent.change(screen.getByLabelText('Booking time'), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText('Booking notes'), { target: { value: 'Window seat' } });
    fireEvent.click(screen.getByText('Book table'));
    await waitFor(() => expect(api.createAdminReservation).toHaveBeenCalledWith({
      customer_name: 'Aisha', customer_phone: '7771234', party_size: 4, date: '2026-10-02', time_slot: '19:00', notes: 'Window seat', confirmed: true,
    }));
    expect(await screen.findByTestId('booking-done')).toHaveTextContent('Booked Aisha, 4 on 2026-10-02 at 19:00 (Hall A). The guest has been texted.');
    await waitFor(() => expect(api.getReservations).toHaveBeenCalledTimes(2));
  });

  it('refuses an incomplete form without calling the API', async () => {
    renderWithRouter(<ReservationsPage />);
    fireEvent.click(await screen.findByText('+ New booking'));
    fireEvent.click(screen.getByText('Book table'));
    expect(await screen.findByText('Name, phone, party size, date and time are all needed.')).toBeInTheDocument();
    expect(api.createAdminReservation).not.toHaveBeenCalled();
  });
});
