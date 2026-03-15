<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    private const PERMISSIONS = [
        // Orders
        ['group' => 'Orders',       'slug' => 'orders.create',          'name' => 'Create Orders'],
        ['group' => 'Orders',       'slug' => 'orders.view',            'name' => 'View Orders'],
        ['group' => 'Orders',       'slug' => 'orders.void',            'name' => 'Void Orders'],
        ['group' => 'Orders',       'slug' => 'orders.refund',          'name' => 'Process Refunds'],

        // Reports
        ['group' => 'Reports',      'slug' => 'reports.view',           'name' => 'View Reports'],
        ['group' => 'Reports',      'slug' => 'reports.sales',          'name' => 'Sales Reports'],
        ['group' => 'Reports',      'slug' => 'reports.inventory',      'name' => 'Inventory Reports'],
        ['group' => 'Reports',      'slug' => 'reports.financial',      'name' => 'Financial Reports'],
        ['group' => 'Reports',      'slug' => 'reports.xreport',        'name' => 'X-Report'],
        ['group' => 'Reports',      'slug' => 'reports.zreport',        'name' => 'Z-Report'],

        // Inventory
        ['group' => 'Inventory',    'slug' => 'inventory.view',         'name' => 'View Inventory'],
        ['group' => 'Inventory',    'slug' => 'inventory.manage',       'name' => 'Manage Inventory'],
        ['group' => 'Inventory',    'slug' => 'inventory.categories',   'name' => 'Manage Categories'],

        // Menu
        ['group' => 'Menu',         'slug' => 'menu.view',              'name' => 'View Menu'],
        ['group' => 'Menu',         'slug' => 'menu.manage',            'name' => 'Manage Menu Items'],

        // Staff
        ['group' => 'Staff',        'slug' => 'staff.view',             'name' => 'View Staff'],
        ['group' => 'Staff',        'slug' => 'staff.create',           'name' => 'Create Staff'],
        ['group' => 'Staff',        'slug' => 'staff.update',           'name' => 'Update Staff'],
        ['group' => 'Staff',        'slug' => 'staff.delete',           'name' => 'Delete Staff'],
        ['group' => 'Staff',        'slug' => 'staff.schedule',         'name' => 'Manage Schedules'],

        // Finance
        ['group' => 'Finance',      'slug' => 'finance.view',           'name' => 'View Finances'],
        ['group' => 'Finance',      'slug' => 'finance.invoices',       'name' => 'Manage Invoices'],
        ['group' => 'Finance',      'slug' => 'finance.expenses',       'name' => 'Manage Expenses'],
        ['group' => 'Finance',      'slug' => 'finance.cash_manage',    'name' => 'Cash Management'],
        ['group' => 'Finance',      'slug' => 'finance.profit_loss',    'name' => 'View Profit & Loss'],

        // Promotions
        ['group' => 'Promotions',   'slug' => 'promotions.view',        'name' => 'View Promotions'],
        ['group' => 'Promotions',   'slug' => 'promotions.manage',      'name' => 'Manage Promotions'],
        ['group' => 'Promotions',   'slug' => 'promotions.discounts',   'name' => 'Apply Discounts'],

        // Customers
        ['group' => 'Customers',    'slug' => 'customers.view',         'name' => 'View Customers'],
        ['group' => 'Customers',    'slug' => 'customers.manage',       'name' => 'Manage Customers'],
        ['group' => 'Customers',    'slug' => 'customers.analytics',    'name' => 'Customer Analytics'],

        // Loyalty
        ['group' => 'Loyalty',      'slug' => 'loyalty.view',           'name' => 'View Loyalty Program'],
        ['group' => 'Loyalty',      'slug' => 'loyalty.manage',         'name' => 'Manage Loyalty Program'],

        // Reservations
        ['group' => 'Reservations', 'slug' => 'reservations.view',      'name' => 'View Reservations'],
        ['group' => 'Reservations', 'slug' => 'reservations.manage',    'name' => 'Manage Reservations'],

        // Delivery
        ['group' => 'Delivery',     'slug' => 'delivery.view',          'name' => 'View Deliveries'],
        ['group' => 'Delivery',     'slug' => 'delivery.manage',        'name' => 'Manage Deliveries'],

        // Devices
        ['group' => 'Devices',      'slug' => 'devices.view',           'name' => 'View Devices'],
        ['group' => 'Devices',      'slug' => 'devices.manage',         'name' => 'Manage Devices'],

        // Integrations
        ['group' => 'Integrations', 'slug' => 'integrations.xero',      'name' => 'Xero Integration'],
        ['group' => 'Integrations', 'slug' => 'integrations.webhooks',  'name' => 'Manage Webhooks'],
        ['group' => 'Integrations', 'slug' => 'integrations.sms',       'name' => 'SMS Campaigns'],

        // Website
        ['group' => 'Website',      'slug' => 'website.manage',         'name' => 'Manage Website Settings'],

        // Suppliers
        ['group' => 'Suppliers',    'slug' => 'suppliers.view',         'name' => 'View Suppliers'],
        ['group' => 'Suppliers',    'slug' => 'suppliers.manage',       'name' => 'Manage Suppliers'],
        ['group' => 'Suppliers',    'slug' => 'suppliers.purchases',    'name' => 'Manage Purchases'],
    ];

    // Slugs excluded from Manager by default
    private const MANAGER_EXCLUDED = [
        'staff.create', 'staff.delete',
        'devices.manage',
        'integrations.xero', 'integrations.webhooks',
        'website.manage',
    ];

    // Slugs granted to Staff by default
    private const STAFF_GRANTED = [
        'orders.create', 'orders.view',
        'reports.view',
        'inventory.view',
        'menu.view',
        'customers.view',
        'suppliers.view',
        'delivery.view',
        'reservations.view',
        'loyalty.view',
    ];

    public function run(): void
    {
        // Upsert all permissions
        foreach (self::PERMISSIONS as $perm) {
            Permission::updateOrCreate(
                ['slug' => $perm['slug']],
                ['name' => $perm['name'], 'group' => $perm['group']],
            );
        }

        $allSlugs = collect(self::PERMISSIONS)->pluck('slug');

        // Owner — all permissions
        $owner = Role::where('slug', 'owner')->first();
        if ($owner) {
            $owner->permissions()->sync(
                Permission::whereIn('slug', $allSlugs)->pluck('id')
            );
        }

        // Manager — all except excluded
        $manager = Role::where('slug', 'manager')->first();
        if ($manager) {
            $managerSlugs = $allSlugs->diff(self::MANAGER_EXCLUDED);
            $manager->permissions()->sync(
                Permission::whereIn('slug', $managerSlugs)->pluck('id')
            );
        }

        // Staff — limited set
        $staff = Role::where('slug', 'staff')->first();
        if ($staff) {
            $staff->permissions()->sync(
                Permission::whereIn('slug', self::STAFF_GRANTED)->pluck('id')
            );
        }
    }
}
