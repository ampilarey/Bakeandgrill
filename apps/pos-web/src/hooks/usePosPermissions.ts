import { POS_ORDER_TYPES, type PosOrderType } from "../orderTypes";
/** Legacy aliases — mirrors PermissionCatalog::SATISFIED_BY for stale cached lists. */
const POS_PERM_ALIASES: Record<string, string[]> = {
  'pos.open_shift': ['finance.cash_manage', 'payments.cash_manage'],
  'pos.close_shift': ['finance.cash_manage', 'payments.cash_manage'],
  'pos.ring_sales': ['orders.create'],
  'pos.hold_resume': ['orders.create'],
  'pos.active_orders': ['orders.view'],
  'pos.view_this_device_orders': ['orders.view'],
  'pos.view_all_station_orders': ['orders.view'],
  'pos.manage_order_status': ['pos.active_orders'],
  'orders.receipts': ['orders.view'],
  'orders.send_sms_bill': ['orders.view'],
  'orders.send_payment_link': ['orders.view'],
  'orders.update': ['orders.manage'],
  'payments.cash_in_out': ['finance.cash_manage', 'payments.cash_manage'],
  'payments.cash_manage': ['finance.cash_manage'],
  'finance.cash_manage': ['payments.cash_manage'],
  // shifts.view_own_history deliberately has no alias — cash_manage no longer
  // implies shift history (mirrors PermissionCatalog, owner 2026-09-01).
  'customers.lookup': ['customers.view'],
  'customers.create': ['customers.manage'],
  'promotions.apply_promo_code': ['promotions.discounts'],
  'promotions.gift_cards': ['promotions.discounts'],
  'integrations.sms': ['sms_marketing.view', 'sms_marketing.manage'],
  'payments.deposit': ['payments.wallet'],
  'payments.wallet': ['payments.deposit'],
};

/** Check if the current cashier holds a permission slug (owner bypass is server-side). */
export function hasPosPermission(permissions: string[], slug: string): boolean {
  if (permissions.includes(slug)) return true;
  for (const alias of POS_PERM_ALIASES[slug] ?? []) {
    if (permissions.includes(alias)) return true;
  }
  return false;
}

/**
 * The POS Customers tab has its own permission, off by default for every
 * role but owner (owner, 2026-10-02: "other cashiers also see the
 * customers … by default it should be off"). Every cashier holds
 * customers.lookup for the cart's picker and managers hold
 * customers.manage, so neither may open the list on its own. What the
 * tab lets someone change still follows the Customers permissions.
 */
export function canSeeCustomersTab(permissions: string[]): boolean {
  return hasPosPermission(permissions, "pos.customers_tab");
}

/**
 * Order types this person may ring (owner, 2026-10-07: "pick up and delivery
 * turns off for staffs and on for a specific staff only"). One permission per
 * type, set per role and per person in Admin. A list cached before those
 * permissions existed names none of them; then every type shows and the
 * server still decides.
 */
export const ORDER_TYPE_PERMISSION: Record<PosOrderType, string> = {
  "Dine-in": "pos.order_type.dine_in",
  Takeaway: "pos.order_type.takeaway",
  Pickup: "pos.order_type.pickup",
  Delivery: "pos.order_type.delivery",
};

export function allowedOrderTypes(permissions: string[]): PosOrderType[] {
  const known = permissions.some((p) => p.startsWith("pos.order_type."));
  if (!known) return [...POS_ORDER_TYPES];
  return POS_ORDER_TYPES.filter((t) => permissions.includes(ORDER_TYPE_PERMISSION[t]));
}
