export type Modifier = {
  id: number;
  name: string;
  price: number;
};

export type Item = {
  id: number;
  category_id: number | null;
  name: string;
  base_price: number;
  barcode: string | null;
  modifiers?: Modifier[];
};

export type Category = {
  id: number;
  name: string;
  items?: Item[];
};

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  modifiers: Modifier[];
};

export type RestaurantTable = {
  id: number;
  name: string;
  capacity: number;
  status: string;
  location?: string | null;
  notes?: string | null;
  is_active: boolean;
};

export type StaffLoginResponse = {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string | null;
  };
};
