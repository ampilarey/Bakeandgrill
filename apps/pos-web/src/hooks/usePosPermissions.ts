/** Legacy aliases — mirrors PermissionCatalog::SATISFIED_BY for stale cached lists. */
const POS_PERM_ALIASES: Record<string, string[]> = {
  'pos.open_shift': ['finance.cash_manage', 'payments.cash_manage'],
  'pos.close_shift': ['finance.cash_manage', 'payments.cash_manage'],
  'pos.ring_sales': ['orders.create'],
  'pos.hold_resume': ['orders.create'],
  'pos.active_orders': ['orders.view'],
  'pos.view_this_device_orders': ['orders.view'],
  'pos.view_all_station_orders': ['orders.view'],
  'orders.receipts': ['orders.view'],
  'payments.cash_in_out': ['finance.cash_manage', 'payments.cash_manage'],
  'shifts.view_own_history': ['finance.cash_manage'],
  'integrations.sms': ['sms_marketing.view', 'sms_marketing.manage'],
  'inventory.manage': ['inventory.view'],
};

/** Check if the current cashier holds a permission slug (owner bypass is server-side). */
export function hasPosPermission(permissions: string[], slug: string): boolean {
  if (permissions.includes(slug)) return true;
  for (const alias of POS_PERM_ALIASES[slug] ?? []) {
    if (permissions.includes(alias)) return true;
  }
  return false;
}
