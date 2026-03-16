export interface Driver {
  id: number;
  name: string;
  phone: string;
  vehicle_type: string | null;
  is_active: boolean;
  has_pin: boolean;
  last_login_at: string | null;
}

export interface DeliveryItem {
  id: number;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  variant: string | null;
  modifiers: string[];
  notes: string | null;
}

export interface Delivery {
  id: number;
  status: DeliveryStatus;
  total: number;
  delivery_fee: number;
  delivery_address: string | null;
  delivery_area: string | null;
  delivery_building: string | null;
  delivery_floor: string | null;
  delivery_notes: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  driver_assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  item_count: number;
  // detail only
  items?: DeliveryItem[];
  customer?: { id: number; name: string; phone: string } | null;
}

export type DeliveryStatus =
  | 'out_for_delivery'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'completed';

export interface Stats {
  today: number;
  this_week: number;
  this_month: number;
  avg_minutes: number | null;
  total_fees_mvr: number;
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
}
