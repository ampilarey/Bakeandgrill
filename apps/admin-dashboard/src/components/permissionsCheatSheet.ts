/** Manager-facing reference — mirrors PermissionCatalog role defaults (high level). */

export type CheatSheetRole = {
  slug: string;
  label: string;
  summary: string;
  can: string[];
  cannot: string[];
};

export const ROLE_CHEAT_SHEET: CheatSheetRole[] = [
  {
    slug: 'staff',
    label: 'Staff (Cashier)',
    summary: 'POS-first role. No admin phone login unless admin.access is granted.',
    can: [
      'POS: ring sales, payments, hold/resume, receipts, discounts, loyalty redeem',
      'Open/close own shift, time clock, own shift history',
      'Admin (if admin.access granted): read orders, menu, reports, inventory view',
    ],
    cannot: [
      'Void, refund, or manage other cashiers’ completed receipts by default',
      'Finance (P&L, invoices, expenses), promotions/loyalty admin, staff management',
      'Device approve, webhooks, Xero, website settings',
    ],
  },
  {
    slug: 'manager',
    label: 'Manager (Supervisor)',
    summary: 'Full day-to-day ops. Admin login included. No owner-only system keys.',
    can: [
      'Everything Staff can, plus void/refund, all-station orders, all shift history',
      'Finance pages, inventory manage, promotions, loyalty, SMS marketing',
      'Operational settings (online ordering, delivery zones, service charge)',
      'Devices list (view only — cannot approve new hardware)',
    ],
    cannot: [
      'Approve/register devices, create/delete staff, webhooks, Xero',
      'Website CMS hub, roles & permissions matrix (use Staff → Permissions for overrides)',
    ],
  },
  {
    slug: 'owner',
    label: 'Owner',
    summary: 'Full access. Permission toggles are reference only — checks always pass.',
    can: ['All permissions', 'Device approval, staff create/delete, settings & permissions hub'],
    cannot: [],
  },
];

export type CommonSlugRow = {
  slug: string;
  gates: string;
  typical: string;
};

export const COMMON_PERMISSION_SLUGS: CommonSlugRow[] = [
  { slug: 'admin.access', gates: 'Admin phone + password login', typical: 'Manager, Owner' },
  { slug: 'pos.access', gates: 'POS PIN login', typical: 'All roles with POS duty' },
  { slug: 'orders.manage', gates: 'KDS bump/start, assign drivers, order admin actions', typical: 'Manager' },
  { slug: 'orders.void', gates: 'Cancel unpaid POS tickets', typical: 'Manager' },
  { slug: 'orders.refund', gates: 'Issue refunds', typical: 'Manager' },
  { slug: 'pos.hold_resume', gates: 'Hold/resume tickets (POS + Orders drawer)', typical: 'Staff+' },
  { slug: 'promotions.discounts', gates: 'Manual discount at POS', typical: 'Staff+' },
  { slug: 'inventory.view', gates: 'View stock levels (read-only UI)', typical: 'Staff+, Manager' },
  { slug: 'inventory.manage', gates: 'Adjust stock, categories, conversions', typical: 'Manager' },
  { slug: 'devices.view', gates: 'List devices & print queue', typical: 'Manager' },
  { slug: 'devices.approve', gates: 'Approve pending POS/KDS devices', typical: 'Owner' },
  { slug: 'settings.update', gates: 'Online ordering & delivery operational settings', typical: 'Manager' },
  { slug: 'website.manage', gates: 'Website CMS, system health, full settings hub', typical: 'Owner' },
  { slug: 'roles_permissions.manage', gates: 'Edit role defaults & user overrides', typical: 'Owner' },
];
