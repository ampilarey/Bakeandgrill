export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type ReservationSlot = {
  time_slot: string;
  available: boolean;
  remaining_capacity: number;
};

export type Reservation = {
  id: number;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  duration_minutes: number;
  status: ReservationStatus;
  notes: string | null;
  table: { id: number; name: string } | null;
  tracking_token: string | null;
  created_at: string;
};

export type ReservationSettings = {
  id: number;
  slot_duration_minutes: number;
  max_party_size: number;
  advance_booking_days: number;
  buffer_minutes_between: number;
  auto_cancel_minutes: number;
};
