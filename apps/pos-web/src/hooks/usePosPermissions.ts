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
  'shifts.view_own_history': ['finance.cash_manage', 'payments.cash_manage'],
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
