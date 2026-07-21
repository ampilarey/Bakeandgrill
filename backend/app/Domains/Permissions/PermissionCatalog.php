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
        'devices.view' => ['devices.manage', 'devices.approve'],
        'roles_permissions.manage' => ['website.manage'],
        'settings.manage' => ['website.manage'],
        'settings.update' => ['settings.manage'],
        'reports.basic' => ['reports.view'],
        'finance.cash_manage' => ['payments.cash_manage'],
        'payments.cash_manage' => ['finance.cash_manage'],
        'payments.cash_in_out' => ['finance.cash_manage'],
        'payments.deposit' => ['payments.wallet'],
        'payments.wallet' => ['payments.deposit'],
        'customers.deposit.view' => ['customers.deposit.manage'],
        'customers.deposit.receive' => ['customers.deposit.manage'],
        'customers.deposit.freeze' => ['customers.deposit.manage'],
        'customers.deposit.refund' => ['customers.deposit.manage'],
        'customers.deposit.transfer_credit' => ['customers.deposit.manage'],
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
        'pos.manage_order_status' => ['pos.active_orders'],
        'orders.receipts' => ['orders.view'],
        'orders.send_sms_bill' => ['orders.view'],
        'orders.send_payment_link' => ['orders.view'],
        'orders.update' => ['orders.manage'],
        'customers.lookup' => ['customers.view'],
        'customers.create' => ['customers.manage'],
        'loyalty.manage' => ['loyalty.manage'],
        'promotions.apply_promo_code' => ['promotions.discounts'],
        'shifts.view_own_history' => ['finance.cash_manage'],
        // Manage implies view so inventory.manage-only roles can list stock.
        'inventory.view' => ['inventory.manage'],
        'suppliers.view' => ['suppliers.view'],
        'kds.view' => ['orders.view'],
        'kds.start_order' => ['orders.manage'],
        'kds.bump_order' => ['orders.manage'],
        'kds.recall_order' => ['orders.manage'],
        'kds.mark_kitchen_done' => ['orders.manage'],
        'kds.print_ticket' => ['orders.manage'],
        'kds.manage_availability' => ['menu.manage'],
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
            ['group' => 'POS', 'slug' => 'pos.manage_order_status', 'name' => 'Update order status', 'description' => 'Start cooking, mark ready, and mark picked up on active orders'],

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
            ['group' => 'Payments', 'slug' => 'payments.wallet', 'name' => 'Pay with customer deposit balance', 'description' => 'Use prepaid deposit wallet tender at POS (legacy slug)'],
            ['group' => 'Payments', 'slug' => 'payments.deposit', 'name' => 'Pay from customer deposit', 'description' => 'Use customer deposit balance at POS'],
            ['group' => 'Payments', 'slug' => 'finance.cash_manage', 'name' => 'Cash management (legacy)'],

            // Customers & loyalty
            ['group' => 'Customers', 'slug' => 'customers.view', 'name' => 'View customers'],
            ['group' => 'Customers', 'slug' => 'customers.manage', 'name' => 'Manage customers'],
            ['group' => 'Customers', 'slug' => 'customers.lookup', 'name' => 'Customer lookup at POS'],
            ['group' => 'Customers', 'slug' => 'customers.create', 'name' => 'Create customers at POS'],
            ['group' => 'Customers', 'slug' => 'customers.analytics', 'name' => 'Customer analytics'],
            ['group' => 'Customers', 'slug' => 'customers.credit.manage', 'name' => 'Manage customer credit accounts', 'description' => 'Approve credit, set limits, block/on-hold accounts'],
            ['group' => 'Customers', 'slug' => 'customers.credit.repay', 'name' => 'Record customer credit repayments', 'description' => 'Apply payments against customer credit balance'],
            ['group' => 'Customers', 'slug' => 'customers.credit.writeoff', 'name' => 'Write off customer credit balance', 'description' => 'Owner-only: zero out uncollectable credit as bad debt'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.manage', 'name' => 'Manage customer deposit accounts', 'description' => 'Legacy: full deposit account management'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.view', 'name' => 'View customer deposit accounts', 'description' => 'View deposit balance and ledger'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.receive', 'name' => 'Receive customer deposits', 'description' => 'Record deposit top-ups from customers'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.freeze', 'name' => 'Freeze or close deposit accounts', 'description' => 'Change deposit account status'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.refund', 'name' => 'Refund customer deposit balance', 'description' => 'Payout unused deposit to customer'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.transfer_credit', 'name' => 'Transfer deposit to credit', 'description' => 'Apply prepaid deposit against credit balance'],
            ['group' => 'Customers', 'slug' => 'customers.deposit.adjust', 'name' => 'Adjust customer deposit balance', 'description' => 'Manual ledger adjustments to prepaid balance'],
            ['group' => 'Loyalty', 'slug' => 'loyalty.view', 'name' => 'View loyalty program'],
            ['group' => 'Loyalty', 'slug' => 'loyalty.manage', 'name' => 'Manage loyalty program'],
            ['group' => 'Loyalty', 'slug' => 'loyalty.redeem', 'name' => 'Redeem loyalty at POS'],

            // Promotions
            ['group' => 'Promotions', 'slug' => 'promotions.view', 'name' => 'View promotions'],
            ['group' => 'Promotions', 'slug' => 'promotions.manage', 'name' => 'Manage promotions'],
            ['group' => 'Promotions', 'slug' => 'promotions.discounts', 'name' => 'Apply discounts'],
            ['group' => 'Promotions', 'slug' => 'promotions.apply_promo_code', 'name' => 'Apply promo codes'],
            ['group' => 'Promotions', 'slug' => 'promotions.discount_cards', 'name' => 'Issue discount cards', 'description' => 'Owner-only: generate time-limited discount cards'],

            // Shifts & reports
            ['group' => 'Shifts', 'slug' => 'shifts.view_own_history', 'name' => 'View own shift history'],
            ['group' => 'Shifts', 'slug' => 'shifts.view_all_history', 'name' => 'View all shift history'],
            ['group' => 'Reports', 'slug' => 'dashboard.view', 'name' => 'View dashboard'],
            ['group' => 'Reports', 'slug' => 'reports.view', 'name' => 'View reports'],
            ['group' => 'Reports', 'slug' => 'reports.basic', 'name' => 'Basic reports'],
            ['group' => 'Reports', 'slug' => 'reports.sales', 'name' => 'Sales reports'],
            ['group' => 'Reports', 'slug' => 'reports.financial', 'name' => 'Financial reports'],
            ['group' => 'Reports', 'slug' => 'reports.gst', 'name' => 'GST reports & MIRA exports'],
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
            ['group' => 'System', 'slug' => 'admin.access', 'name' => 'Access admin panel', 'description' => 'Sign in to the admin dashboard (phone + password)'],
            ['group' => 'System', 'slug' => 'roles_permissions.manage', 'name' => 'Manage roles & permissions'],
            ['group' => 'System', 'slug' => 'settings.manage', 'name' => 'Manage settings'],
            ['group' => 'System', 'slug' => 'settings.update', 'name' => 'Update operational settings'],
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
            ['group' => 'Events', 'slug' => 'events.manage', 'name' => 'Manage events & catering quotes', 'description' => 'Edit event lines, send quotes, fire events to kitchen'],
            ['group' => 'Delivery', 'slug' => 'delivery.view', 'name' => 'View deliveries'],
            ['group' => 'Delivery', 'slug' => 'delivery.manage', 'name' => 'Manage deliveries'],

            // Kitchen / KDS
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.view', 'name' => 'View kitchen display', 'description' => 'View KDS queue and stream'],
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.start_order', 'name' => 'Start order on KDS', 'description' => 'Move ticket to in progress from kitchen'],
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.bump_order', 'name' => 'Bump order on KDS', 'description' => 'Clear ready ticket after handoff'],
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.recall_order', 'name' => 'Recall order on KDS'],
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.mark_kitchen_done', 'name' => 'Mark kitchen preparation done', 'description' => 'Signal food is ready for cashier review — does not notify customer'],
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.print_ticket', 'name' => 'Reprint kitchen ticket'],
            ['group' => 'Kitchen / KDS', 'slug' => 'kds.manage_availability', 'name' => '86 items from KDS', 'description' => 'Toggle item availability from kitchen display'],

            // Purchase Requests
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.create', 'name' => 'Create purchase requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.view_own', 'name' => 'View own purchase requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.view_all', 'name' => 'View all purchase requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.approve', 'name' => 'Approve purchase requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.assign', 'name' => 'Assign buyers'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.buy', 'name' => 'Mark items bought (when assigned)'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.verify', 'name' => 'Verify received items'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.cancel', 'name' => 'Cancel purchase requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.reject', 'name' => 'Reject purchase requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.merge', 'name' => 'Merge duplicate requests'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.convert_to_purchase', 'name' => 'Convert request to purchase order'],
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.convert_to_expense', 'name' => 'Convert request to expense'],

            // Kitchen Production & Receiving
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.create', 'name' => 'Create kitchen production batches'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.submit', 'name' => 'Submit kitchen production'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.view_own', 'name' => 'View own kitchen production'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.view_all', 'name' => 'View all kitchen production'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.cancel_own', 'name' => 'Cancel own production batches'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.record_waste', 'name' => 'Record kitchen waste'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.record_remake', 'name' => 'Record kitchen remake'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.attach_photo', 'name' => 'Attach kitchen production photos'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.manage', 'name' => 'Manage kitchen production'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.override', 'name' => 'Override kitchen production records'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.convert_to_prepared_stock', 'name' => 'Convert production to prepared stock'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.production.reports', 'name' => 'View kitchen production reports'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.receiving.view', 'name' => 'View kitchen receiving queue'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.receiving.receive', 'name' => 'Receive from kitchen'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.receiving.reject', 'name' => 'Reject kitchen handover'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.receiving.request_remake', 'name' => 'Request kitchen remake'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.receiving.attach_photo', 'name' => 'Attach receiving photos'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.receiving.manage', 'name' => 'Manage kitchen receiving'],
            ['group' => 'Kitchen Production', 'slug' => 'kitchen.variance.review', 'name' => 'Review kitchen variances'],
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
            'customers.credit.writeoff',
            'customers.deposit.adjust',
            'customers.deposit.transfer_credit',
            // Discount cards — owner-issued only by default
            'promotions.discount_cards',
        ];

        return array_values(array_diff(self::ownerSlugs(), $excluded));
    }

    /** @return list<string> */
    public static function kitchenProductionStaffSlugs(): array
    {
        return [
            'kitchen.production.create',
            'kitchen.production.submit',
            'kitchen.production.view_own',
            'kitchen.production.cancel_own',
            'kitchen.production.record_waste',
            'kitchen.production.record_remake',
            'kitchen.production.attach_photo',
        ];
    }

    /** @return list<string> */
    public static function kitchenReceivingStaffSlugs(): array
    {
        return [
            'kitchen.receiving.view',
            'kitchen.receiving.receive',
            'kitchen.receiving.reject',
            'kitchen.receiving.request_remake',
            'kitchen.receiving.attach_photo',
        ];
    }

    /** @return list<string> */
    public static function purchaseRequestsStaffSlugs(): array
    {
        return [
            'purchase_requests.create',
            'purchase_requests.view_own',
            'purchase_requests.buy',
        ];
    }

    /** @return list<string> */
    public static function staffSlugs(): array
    {
        return [
            'pos.access', 'pos.open_shift', 'pos.close_shift', 'pos.lock_screen', 'pos.time_clock',
            'pos.ring_sales', 'pos.hold_resume', 'pos.active_orders', 'pos.manage_order_status', 'pos.view_this_device_orders',
            'orders.create', 'orders.view', 'orders.update', 'orders.receipts',
            'orders.send_sms_bill', 'orders.send_payment_link',
            'payments.cash', 'payments.card', 'payments.split', 'payments.credit', 'payments.wallet', 'payments.deposit',
            'payments.cash_manage', 'payments.cash_in_out', 'finance.cash_manage',
            'customers.view', 'customers.lookup', 'customers.create',
            'loyalty.view', 'loyalty.redeem',
            'promotions.view', 'promotions.discounts', 'promotions.apply_promo_code',
            'shifts.view_own_history',
            // reports.view / reports.basic intentionally omitted — owner/manager
            // defaults only; grant per-user when a cashier needs POS/Admin reports.
            'dashboard.view',
            'inventory.view', 'suppliers.view', 'delivery.view', 'reservations.view',
            'menu.view',
            ...self::purchaseRequestsStaffSlugs(),
            ...self::kitchenReceivingStaffSlugs(),
        ];
    }

    /** @return list<string> */
    public static function kitchenStaffSlugs(): array
    {
        return [
            'kds.view',
            'kds.start_order',
            'kds.mark_kitchen_done',
            'kds.print_ticket',
            'pos.time_clock',
            'pos.lock_screen',
            ...self::purchaseRequestsStaffSlugs(),
            ...self::kitchenProductionStaffSlugs(),
        ];
    }

    /** @return list<string> */
    public static function slugsForRole(string $roleSlug): array
    {
        return match ($roleSlug) {
            'owner' => self::ownerSlugs(),
            'manager' => self::managerSlugs(),
            'staff' => self::staffSlugs(),
            'kitchen_staff' => self::kitchenStaffSlugs(),
            default => [],
        };
    }

    /** @return list<string> */
    public static function expandCheckSlugs(string $slug): array
    {
        return array_values(array_unique([$slug, ...(self::SATISFIED_BY[$slug] ?? [])]));
    }
}
