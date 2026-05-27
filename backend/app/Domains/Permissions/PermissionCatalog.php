<?php

declare(strict_types=1);

namespace App\Domains\Permissions;

/**
 * Single source of truth for permission definitions and role defaults.
 */
final class PermissionCatalog
{
    /**
     * Checking $slug is allowed if the user holds $slug OR any legacy alias.
     *
     * @var array<string, list<string>>
     */
    public const SATISFIED_BY = [
        'devices.approve' => ['devices.manage'],
        'roles_permissions.manage' => ['website.manage'],
        'settings.manage' => ['website.manage'],
        'reports.basic' => ['reports.view'],
        'payments.cash_manage' => ['finance.cash_manage'],
        'payments.cash_in_out' => ['finance.cash_manage'],
        'sms_marketing.view' => ['integrations.sms'],
        'sms_marketing.manage' => ['integrations.sms'],
        'webhooks.manage' => ['integrations.webhooks'],
        'xero.manage' => ['integrations.xero'],
        'users.view' => ['staff.view'],
        'users.create' => ['staff.create'],
        'users.update' => ['staff.update'],
        'users.delete' => ['staff.delete'],
        'menu.manage' => ['menu.manage'],
        'website.manage' => ['website.manage'],
        'pos.active_orders' => ['orders.view'],
        'pos.view_this_device_orders' => ['orders.view'],
        'pos.ring_sales' => ['orders.create'],
        'pos.hold_resume' => ['orders.create'],
        'pos.open_shift' => ['finance.cash_manage', 'payments.cash_manage'],
        'pos.close_shift' => ['finance.cash_manage', 'payments.cash_manage'],
        'pos.lock_screen' => ['pos.access'],
        'pos.time_clock' => ['pos.access'],
        'orders.receipts' => ['orders.view'],
        'orders.send_sms_bill' => ['orders.view'],
        'orders.send_payment_link' => ['orders.view'],
        'orders.update' => ['orders.manage'],
        'orders.receipts' => ['orders.view'],
        'orders.send_sms_bill' => ['orders.view'],
        'orders.send_payment_link' => ['orders.view'],
        'customers.lookup' => ['customers.view'],
        'customers.create' => ['customers.manage'],
        'loyalty.manage' => ['loyalty.manage'],
        'promotions.apply_promo_code' => ['promotions.discounts'],
        'promotions.gift_cards' => ['promotions.discounts'],
        'shifts.view_own_history' => ['finance.cash_manage'],
        'inventory.view' => ['inventory.view'],
        'suppliers.view' => ['suppliers.view'],
    ];

    /** @return list<array{slug: string, name: string, group: string, description?: string}> */
    public static function definitions(): array
    {
        return [
            // Core POS
            ['group' => 'POS', 'slug' => 'pos.access', 'name' => 'Access POS app', 'description' => 'Sign in to the Point of Sale'],
            ['group' => 'POS', 'slug' => 'pos.open_shift', 'name' => 'Open shift'],
            ['group' => 'POS', 'slug' => 'pos.close_shift', 'name' => 'Close shift'],
            ['group' => 'POS', 'slug' => 'pos.lock_screen', 'name' => 'Lock screen / switch user'],
            ['group' => 'POS', 'slug' => 'pos.time_clock', 'name' => 'Use time clock'],
            ['group' => 'POS', 'slug' => 'pos.ring_sales', 'name' => 'Ring sales'],
            ['group' => 'POS', 'slug' => 'pos.hold_resume', 'name' => 'Hold & resume tickets'],
            ['group' => 'POS', 'slug' => 'pos.active_orders', 'name' => 'View active orders'],
            ['group' => 'POS', 'slug' => 'pos.view_this_device_orders', 'name' => 'View this device orders'],
            ['group' => 'POS', 'slug' => 'pos.view_all_station_orders', 'name' => 'View all station orders'],

            // Orders
            ['group' => 'Orders', 'slug' => 'orders.create', 'name' => 'Create orders'],
            ['group' => 'Orders', 'slug' => 'orders.view', 'name' => 'View orders'],
            ['group' => 'Orders', 'slug' => 'orders.manage', 'name' => 'Manage orders & drivers'],
            ['group' => 'Orders', 'slug' => 'orders.update', 'name' => 'Update orders'],
            ['group' => 'Orders', 'slug' => 'orders.void', 'name' => 'Void orders'],
            ['group' => 'Orders', 'slug' => 'orders.refund', 'name' => 'Process refunds'],
            ['group' => 'Orders', 'slug' => 'orders.receipts', 'name' => 'View & send receipts'],
            ['group' => 'Orders', 'slug' => 'orders.send_sms_bill', 'name' => 'Send SMS bill'],
            ['group' => 'Orders', 'slug' => 'orders.send_payment_link', 'name' => 'Send payment link'],

            // Payments
            ['group' => 'Payments', 'slug' => 'payments.cash', 'name' => 'Take cash payments'],
            ['group' => 'Payments', 'slug' => 'payments.card', 'name' => 'Take card payments'],
            ['group' => 'Payments', 'slug' => 'payments.split', 'name' => 'Split tender payments'],
            ['group' => 'Payments', 'slug' => 'payments.cash_manage', 'name' => 'Manage cash drawer'],
            ['group' => 'Payments', 'slug' => 'payments.cash_in_out', 'name' => 'Cash in / cash out'],
            ['group' => 'Payments', 'slug' => 'payments.credit', 'name' => 'Charge to customer credit account', 'description' => 'Use Credit Account tender at POS for approved customers'],
            ['group' => 'Payments', 'slug' => 'finance.cash_manage', 'name' => 'Cash management (legacy)'],

            // Customers & loyalty
            ['group' => 'Customers', 'slug' => 'customers.view', 'name' => 'View customers'],
            ['group' => 'Customers', 'slug' => 'customers.manage', 'name' => 'Manage customers'],
            ['group' => 'Customers', 'slug' => 'customers.lookup', 'name' => 'Customer lookup at POS'],
            ['group' => 'Customers', 'slug' => 'customers.create', 'name' => 'Create customers at POS'],
            ['group' => 'Customers', 'slug' => 'customers.analytics', 'name' => 'Customer analytics'],
            ['group' => 'Customers', 'slug' => 'customers.credit.manage', 'name' => 'Manage customer credit accounts', 'description' => 'Approve credit, set limits, block/on-hold accounts'],
            ['group' => 'Customers', 'slug' => 'customers.credit.repay', 'name' => 'Record customer credit repayments', 'description' => 'Apply payments against customer credit balance'],
            ['group' => 'Loyalty', 'slug' => 'loyalty.view', 'name' => 'View loyalty program'],
            ['group' => 'Loyalty', 'slug' => 'loyalty.manage', 'name' => 'Manage loyalty program'],
            ['group' => 'Loyalty', 'slug' => 'loyalty.redeem', 'name' => 'Redeem loyalty at POS'],

            // Promotions
            ['group' => 'Promotions', 'slug' => 'promotions.view', 'name' => 'View promotions'],
            ['group' => 'Promotions', 'slug' => 'promotions.manage', 'name' => 'Manage promotions'],
            ['group' => 'Promotions', 'slug' => 'promotions.discounts', 'name' => 'Apply discounts'],
            ['group' => 'Promotions', 'slug' => 'promotions.apply_promo_code', 'name' => 'Apply promo codes'],
            ['group' => 'Promotions', 'slug' => 'promotions.gift_cards', 'name' => 'Redeem gift cards'],

            // Shifts & reports
            ['group' => 'Shifts', 'slug' => 'shifts.view_own_history', 'name' => 'View own shift history'],
            ['group' => 'Shifts', 'slug' => 'shifts.view_all_history', 'name' => 'View all shift history'],
            ['group' => 'Reports', 'slug' => 'dashboard.view', 'name' => 'View dashboard'],
            ['group' => 'Reports', 'slug' => 'reports.view', 'name' => 'View reports'],
            ['group' => 'Reports', 'slug' => 'reports.basic', 'name' => 'Basic reports'],
            ['group' => 'Reports', 'slug' => 'reports.sales', 'name' => 'Sales reports'],
            ['group' => 'Reports', 'slug' => 'reports.financial', 'name' => 'Financial reports'],
            ['group' => 'Reports', 'slug' => 'reports.inventory', 'name' => 'Inventory reports'],
            ['group' => 'Reports', 'slug' => 'reports.xreport', 'name' => 'X-Report'],
            ['group' => 'Reports', 'slug' => 'reports.zreport', 'name' => 'Z-Report'],

            // Operations
            ['group' => 'Inventory', 'slug' => 'inventory.view', 'name' => 'View inventory'],
            ['group' => 'Inventory', 'slug' => 'inventory.manage', 'name' => 'Manage inventory'],
            ['group' => 'Inventory', 'slug' => 'inventory.categories', 'name' => 'Manage inventory categories'],
            ['group' => 'Suppliers', 'slug' => 'suppliers.view', 'name' => 'View suppliers'],
            ['group' => 'Suppliers', 'slug' => 'suppliers.manage', 'name' => 'Manage suppliers'],
            ['group' => 'Suppliers', 'slug' => 'suppliers.purchases', 'name' => 'Manage purchases'],
            ['group' => 'Marketing', 'slug' => 'sms_marketing.view', 'name' => 'View SMS marketing'],
            ['group' => 'Marketing', 'slug' => 'sms_marketing.manage', 'name' => 'Manage SMS marketing'],
            ['group' => 'Marketing', 'slug' => 'integrations.sms', 'name' => 'SMS campaigns (legacy)'],

            // Admin / setup
            ['group' => 'Devices', 'slug' => 'devices.view', 'name' => 'View devices'],
            ['group' => 'Devices', 'slug' => 'devices.approve', 'name' => 'Approve POS devices'],
            ['group' => 'Devices', 'slug' => 'devices.manage', 'name' => 'Manage devices (legacy)'],
            ['group' => 'Staff', 'slug' => 'staff.view', 'name' => 'View staff'],
            ['group' => 'Staff', 'slug' => 'staff.create', 'name' => 'Create staff'],
            ['group' => 'Staff', 'slug' => 'staff.update', 'name' => 'Update staff'],
            ['group' => 'Staff', 'slug' => 'staff.delete', 'name' => 'Delete staff'],
            ['group' => 'Staff', 'slug' => 'staff.schedule', 'name' => 'Manage schedules'],
            ['group' => 'Staff', 'slug' => 'users.view', 'name' => 'View users'],
            ['group' => 'Staff', 'slug' => 'users.create', 'name' => 'Create users'],
            ['group' => 'Staff', 'slug' => 'users.update', 'name' => 'Update users'],
            ['group' => 'Staff', 'slug' => 'users.delete', 'name' => 'Delete users'],
            ['group' => 'System', 'slug' => 'roles_permissions.manage', 'name' => 'Manage roles & permissions'],
            ['group' => 'System', 'slug' => 'settings.manage', 'name' => 'Manage settings'],
            ['group' => 'System', 'slug' => 'website.manage', 'name' => 'Manage website (legacy)'],
            ['group' => 'System', 'slug' => 'webhooks.manage', 'name' => 'Manage webhooks'],
            ['group' => 'System', 'slug' => 'integrations.webhooks', 'name' => 'Webhooks (legacy)'],
            ['group' => 'System', 'slug' => 'xero.manage', 'name' => 'Manage Xero'],
            ['group' => 'System', 'slug' => 'integrations.xero', 'name' => 'Xero (legacy)'],
            ['group' => 'Menu', 'slug' => 'menu.view', 'name' => 'View menu'],
            ['group' => 'Menu', 'slug' => 'menu.manage', 'name' => 'Manage menu'],
            ['group' => 'Menu', 'slug' => 'menu.prepared_stock', 'name' => 'Adjust prepared menu stock at POS', 'description' => 'Add or remove ready-made menu item counts from the POS Operations panel'],

            // Finance & other admin (retained)
            ['group' => 'Finance', 'slug' => 'finance.view', 'name' => 'View finances'],
            ['group' => 'Finance', 'slug' => 'finance.invoices', 'name' => 'Manage invoices'],
            ['group' => 'Finance', 'slug' => 'finance.expenses', 'name' => 'Manage expenses'],
            ['group' => 'Finance', 'slug' => 'finance.profit_loss', 'name' => 'Profit & loss'],
            ['group' => 'Reservations', 'slug' => 'reservations.view', 'name' => 'View reservations'],
            ['group' => 'Reservations', 'slug' => 'reservations.manage', 'name' => 'Manage reservations'],
            ['group' => 'Delivery', 'slug' => 'delivery.view', 'name' => 'View deliveries'],
            ['group' => 'Delivery', 'slug' => 'delivery.manage', 'name' => 'Manage deliveries'],
        ];
    }

    /** @return list<string> */
    public static function ownerSlugs(): array
    {
        return array_column(self::definitions(), 'slug');
    }

    /** @return list<string> */
    public static function managerSlugs(): array
    {
        // Manager gets day-to-day ops; exclude owner-only system control.
        $excluded = [
            'devices.approve', 'devices.manage',
            'staff.create', 'staff.delete',
            'users.create', 'users.delete',
            'roles_permissions.manage', 'settings.manage', 'website.manage',
            'webhooks.manage', 'integrations.webhooks',
            'xero.manage', 'integrations.xero',
            'customers.credit.repay',
        ];

        return array_values(array_diff(self::ownerSlugs(), $excluded));
    }

    /** @return list<string> */
    public static function staffSlugs(): array
    {
        return [
            'pos.access', 'pos.open_shift', 'pos.close_shift', 'pos.lock_screen', 'pos.time_clock',
            'pos.ring_sales', 'pos.hold_resume', 'pos.active_orders', 'pos.view_this_device_orders',
            'orders.create', 'orders.view', 'orders.update', 'orders.receipts',
            'orders.send_sms_bill', 'orders.send_payment_link',
            'payments.cash', 'payments.card', 'payments.split', 'payments.credit',
            'payments.cash_manage', 'payments.cash_in_out', 'finance.cash_manage',
            'customers.view', 'customers.lookup', 'customers.create',
            'loyalty.view', 'loyalty.redeem',
            'promotions.view', 'promotions.discounts', 'promotions.apply_promo_code', 'promotions.gift_cards',
            'shifts.view_own_history',
            'reports.view', 'reports.basic',
            'dashboard.view',
            'inventory.view', 'suppliers.view', 'delivery.view', 'reservations.view',
            'menu.view',
        ];
    }

    /** @return list<string> */
    public static function slugsForRole(string $roleSlug): array
    {
        return match ($roleSlug) {
            'owner' => self::ownerSlugs(),
            'manager' => self::managerSlugs(),
            'staff' => self::staffSlugs(),
            default => [],
        };
    }

    /** @return list<string> */
    public static function expandCheckSlugs(string $slug): array
    {
        return array_values(array_unique([$slug, ...(self::SATISFIED_BY[$slug] ?? [])]));
    }
}
