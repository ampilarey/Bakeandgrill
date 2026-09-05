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
        // SMS Control Center granular split — legacy holders keep full access
        'sms.logs.view' => ['integrations.sms', 'sms_marketing.manage'],
        'sms.templates.edit' => ['integrations.sms', 'sms_marketing.manage'],
        'sms.settings.manage' => ['integrations.sms', 'sms_marketing.manage'],
        'sms.contacts.manage' => ['integrations.sms', 'sms_marketing.manage'],
        'sms.scheduled.manage' => ['integrations.sms', 'sms_marketing.manage'],
        'sms.campaigns.send' => ['integrations.sms', 'sms_marketing.manage'],
        'sms.transactional.manage' => ['integrations.sms', 'sms_marketing.manage'],
        'media.view' => ['website.manage', 'menu.manage'],
        'media.manage' => ['website.manage'],
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
        // shifts.view_own_history deliberately has NO satisfier: cash_manage
        // used to imply it, which quietly handed every cashier the shift
        // history (daily sales / discounts / refunds). Owner, 2026-09-01:
        // history is manager territory; grant per-user when trusted.
        // Manage implies view so inventory.manage-only roles can list stock.
        'inventory.view' => ['inventory.manage'],
        // Anyone trusted to adjust stock by hand can certainly count it. The
        // reverse is not true, which is why posting is not implied here.
        'inventory.stock_count' => ['inventory.manage'],
        // Receiving a delivery is the floor-level half of verifying one, so
        // anyone trusted to verify can receive. The reverse is not true:
        // receiving is confirming a box arrived, verifying is signing off the
        // whole request and what it cost.
        'purchase_requests.receive' => ['purchase_requests.verify'],
        'suppliers.view' => ['suppliers.view'],
        'kds.view' => ['orders.view'],
        'kds.start_order' => ['orders.manage'],
        'kds.bump_order' => ['orders.manage'],
        'kds.recall_order' => ['orders.manage'],
        'kds.mark_kitchen_done' => ['orders.manage'],
        'kds.print_ticket' => ['orders.manage'],
        'kds.manage_availability' => ['menu.manage'],
        // Service Availability (Stage 4). Decision §17: manage_public may be
        // satisfied by settings.update for smoother migration; internal +
        // emergency + schedule + restore + notify require the explicit slug.
        'service_availability.view' => ['settings.update'],
        'service_availability.manage_public' => ['settings.update'],
        // Wholesale — manage/dispatch/reconcile imply view only (never alias to website/settings/roles).
        'trade.view' => [
            'trade.manage_accounts',
            'trade.manage_prices',
            'trade.dispatch',
            'trade.reconcile',
            'trade.invoice',
        ],
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
            ['group' => 'Orders', 'slug' => 'orders.refund_request', 'name' => 'Request refunds', 'description' => 'Raise a refund for owner/manager approval — does not move money'],
            ['group' => 'Orders', 'slug' => 'orders.refund', 'name' => 'Approve refunds', 'description' => 'Approve or reject refund requests — money moves only on approval'],
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
            ['group' => 'Promotions', 'slug' => 'promotions.discount_override', 'name' => 'Approve POS discounts', 'description' => 'Receive SMS approval codes for manual POS discounts'],
            ['group' => 'Promotions', 'slug' => 'promotions.apply_promo_code', 'name' => 'Apply promo codes'],
            ['group' => 'Promotions', 'slug' => 'promotions.discount_cards', 'name' => 'Issue discount cards', 'description' => 'Owner-only: generate time-limited discount cards'],
            ['group' => 'Promotions', 'slug' => 'discounts.settings.manage', 'name' => 'Manage discount controls', 'description' => 'Configure POS discount caps, reasons, and approval'],

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
            ['group' => 'Inventory', 'slug' => 'inventory.stock_count', 'name' => 'Run a stock count', 'description' => 'Open a counting sheet and enter counts — the expected figures stay hidden and nothing moves'],
            ['group' => 'Inventory', 'slug' => 'inventory.stock_count.post', 'name' => 'Review and post a stock count', 'description' => 'See the variances and accept them — stock moves on posting, and not by the person who counted'],
            ['group' => 'Suppliers', 'slug' => 'suppliers.view', 'name' => 'View suppliers'],
            ['group' => 'Suppliers', 'slug' => 'suppliers.manage', 'name' => 'Manage suppliers'],
            ['group' => 'Suppliers', 'slug' => 'suppliers.purchases', 'name' => 'Manage purchases'],
            ['group' => 'Marketing', 'slug' => 'sms_marketing.view', 'name' => 'View SMS marketing'],
            ['group' => 'Marketing', 'slug' => 'sms_marketing.manage', 'name' => 'Manage SMS marketing'],
            ['group' => 'Marketing', 'slug' => 'integrations.sms', 'name' => 'SMS campaigns (legacy)'],
            ['group' => 'Marketing', 'slug' => 'signage.manage', 'name' => 'Manage TV signage', 'description' => 'TV menu boards, playlists, screens, campaigns & emergency'],
            ['group' => 'Marketing', 'slug' => 'social.view', 'name' => 'View Social Hub', 'description' => 'See social posts, queue and history'],
            ['group' => 'Marketing', 'slug' => 'social.compose', 'name' => 'Compose social posts', 'description' => 'Create and edit social post drafts'],
            ['group' => 'Marketing', 'slug' => 'social.schedule', 'name' => 'Schedule social posts', 'description' => 'Schedule drafts for later publishing'],
            ['group' => 'Marketing', 'slug' => 'social.publish', 'name' => 'Publish social posts', 'description' => 'Post now / approve scheduled posts for publishing'],
            ['group' => 'Marketing', 'slug' => 'social.channels.manage', 'name' => 'Manage social channels', 'description' => 'Connect social accounts and rotate their tokens. Owner-only by default — tokens post as the business.'],
            ['group' => 'SMS', 'slug' => 'sms.logs.view', 'name' => 'View SMS logs', 'description' => 'View SMS audit logs and stats'],
            ['group' => 'SMS', 'slug' => 'sms.templates.edit', 'name' => 'Edit SMS templates', 'description' => 'Edit wording of any SMS template'],
            ['group' => 'SMS', 'slug' => 'sms.settings.manage', 'name' => 'Manage SMS settings', 'description' => 'Toggle SMS types on/off and view Control Center'],
            ['group' => 'SMS', 'slug' => 'sms.contacts.manage', 'name' => 'Manage SMS contacts', 'description' => 'Contacts and contact groups'],
            ['group' => 'SMS', 'slug' => 'sms.scheduled.manage', 'name' => 'Manage scheduled SMS', 'description' => 'Scheduled messages'],
            ['group' => 'SMS', 'slug' => 'sms.campaigns.send', 'name' => 'Send SMS campaigns', 'description' => 'Create and send bulk campaigns and promotions'],
            ['group' => 'SMS', 'slug' => 'sms.transactional.manage', 'name' => 'Manage transactional SMS', 'description' => 'Allow/trigger transactional and staff SMS types'],

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

            // Service Availability & Maintenance (plan §13)
            ['group' => 'Service Availability', 'slug' => 'service_availability.view', 'name' => 'View service availability', 'description' => 'View the maintenance dashboard and current service states'],
            ['group' => 'Service Availability', 'slug' => 'service_availability.manage_public', 'name' => 'Manage public services', 'description' => 'Toggle checkout, payment, delivery, catering, registration'],
            ['group' => 'Service Availability', 'slug' => 'service_availability.schedule', 'name' => 'Schedule maintenance windows', 'description' => 'Set future starts_at/ends_at for planned maintenance'],
            ['group' => 'Service Availability', 'slug' => 'service_availability.restore', 'name' => 'Restore disabled services', 'description' => 'Flip a service back to available and close the incident'],
            ['group' => 'Service Availability', 'slug' => 'service_availability.notify', 'name' => 'Send restoration SMS', 'description' => 'Dispatch queued restoration notifications after restore'],
            ['group' => 'Service Availability', 'slug' => 'service_availability.manage_internal', 'name' => 'Manage internal services (owner)', 'description' => 'Toggle POS, KDS, delivery ops availability'],
            ['group' => 'Service Availability', 'slug' => 'service_availability.emergency', 'name' => 'Trigger emergency lockdown (owner)', 'description' => 'Owner-only master kill switch — typed confirmation required'],

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
            ['group' => 'Menu', 'slug' => 'recipes.manage', 'name' => 'Recipes & item costing', 'description' => 'Record item recipes and see cost price, margin and profit. Owner-only by default — it exposes what each dish costs to make.'],
            ['group' => 'Menu', 'slug' => 'menu.prepared_stock', 'name' => 'Adjust prepared menu stock at POS', 'description' => 'Add or remove ready-made menu item counts from the POS Operations panel'],
            ['group' => 'Media', 'slug' => 'media.view', 'name' => 'View media library', 'description' => 'Browse the Media Library and pick assets'],
            ['group' => 'Media', 'slug' => 'media.manage', 'name' => 'Manage media library', 'description' => 'Upload, edit, delete, and reconcile media'],

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

            // Customer complaints — owner-only by default
            ['group' => 'Complaints', 'slug' => 'complaints.view', 'name' => 'View complaints', 'description' => 'See customer complaint queue, photos and history'],
            ['group' => 'Complaints', 'slug' => 'complaints.manage', 'name' => 'Manage complaints', 'description' => 'Update status, contact log and resolution notes'],

            // Wholesale consignment (Stage A) — owner-only by default
            ['group' => 'Wholesale', 'slug' => 'trade.view', 'name' => 'View trade accounts', 'description' => 'See wholesale shops, price lists and deliveries'],
            ['group' => 'Wholesale', 'slug' => 'trade.manage_accounts', 'name' => 'Manage trade accounts', 'description' => 'Create and edit wholesale shop terms'],
            ['group' => 'Wholesale', 'slug' => 'trade.manage_prices', 'name' => 'Manage wholesale prices', 'description' => 'Edit per-shop wholesale price lists'],
            ['group' => 'Wholesale', 'slug' => 'trade.dispatch', 'name' => 'Dispatch wholesale deliveries', 'description' => 'Send consignment goods to shops'],
            ['group' => 'Wholesale', 'slug' => 'trade.reconcile', 'name' => 'Reconcile wholesale deliveries', 'description' => 'Record what sold and what came back'],
            ['group' => 'Wholesale', 'slug' => 'trade.invoice', 'name' => 'Raise wholesale invoices', 'description' => 'Invoice shops, resolve mismatches, credit notes'],

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
            ['group' => 'Purchase Requests', 'slug' => 'purchase_requests.receive', 'name' => 'Accept a delivery'],
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

    /**
     * Permissions that stay owner-default only (not on the manager allowlist).
     * When adding a catalog slug, put it in managerSlugs() OR here — never leave it undecided.
     *
     * @return list<string>
     */
    public static function ownerOnlySlugs(): array
    {
        return [
            'complaints.manage',
            'complaints.view',
            // Audit 2026-09-03 (F2): customers.credit.repay moved to managers
            // on the owner's say-so — see managerSlugs(). Writing a balance OFF
            // is money out with no cash trail, and stays here.
            'customers.credit.writeoff',
            'customers.deposit.adjust',
            'customers.deposit.transfer_credit',
            'devices.approve',
            'devices.manage',
            'integrations.webhooks',
            'integrations.xero',
            'promotions.discount_cards',
            'recipes.manage',
            'roles_permissions.manage',
            'service_availability.emergency',
            'service_availability.manage_internal',
            'settings.manage',
            'social.channels.manage',
            'staff.create',
            'staff.delete',
            'trade.dispatch',
            'trade.invoice',
            'trade.manage_accounts',
            'trade.manage_prices',
            'trade.reconcile',
            'trade.view',
            'users.create',
            'users.delete',
            'webhooks.manage',
            'website.manage',
            'xero.manage',
        ];
    }

    /**
     * Explicit manager allowlist (same shape as staffSlugs()).
     * New catalog permissions do NOT land here automatically — decide manager vs owner-only.
     *
     * @return list<string>
     */
    public static function managerSlugs(): array
    {
        return [
            'admin.access',
            'customers.analytics',
            'customers.create',
            'customers.credit.manage',
            // Audit 2026-09-03 (F2), owner-approved: a manager could approve
            // credit and raise a limit but not take the customer's payment
            // against it, which made the owner a bottleneck at the counter.
            // Money IN is reconcilable — a repayment writes a CashMovement into
            // the taker's shift, so a false one shows as a short drawer at
            // close. Money OUT (customers.credit.writeoff) stays owner-only.
            'customers.credit.repay',
            'customers.deposit.freeze',
            'customers.deposit.manage',
            'customers.deposit.receive',
            'customers.deposit.refund',
            'customers.deposit.view',
            'customers.lookup',
            'customers.manage',
            'customers.view',
            'dashboard.view',
            'delivery.manage',
            'delivery.view',
            'devices.view',
            'discounts.settings.manage',
            'events.manage',
            'finance.cash_manage',
            'finance.expenses',
            'finance.invoices',
            'finance.profit_loss',
            'finance.view',
            'integrations.sms',
            'inventory.categories',
            'inventory.manage',
            'inventory.stock_count',
            'inventory.stock_count.post',
            'inventory.view',
            'kds.bump_order',
            'kds.manage_availability',
            'kds.mark_kitchen_done',
            'kds.print_ticket',
            'kds.recall_order',
            'kds.start_order',
            'kds.view',
            'kitchen.production.attach_photo',
            'kitchen.production.cancel_own',
            'kitchen.production.convert_to_prepared_stock',
            'kitchen.production.create',
            'kitchen.production.manage',
            'kitchen.production.override',
            'kitchen.production.record_remake',
            'kitchen.production.record_waste',
            'kitchen.production.reports',
            'kitchen.production.submit',
            'kitchen.production.view_all',
            'kitchen.production.view_own',
            'kitchen.receiving.attach_photo',
            'kitchen.receiving.manage',
            'kitchen.receiving.receive',
            'kitchen.receiving.reject',
            'kitchen.receiving.request_remake',
            'kitchen.receiving.view',
            'kitchen.variance.review',
            'loyalty.manage',
            'loyalty.redeem',
            'loyalty.view',
            'media.manage',
            'media.view',
            'menu.manage',
            'menu.prepared_stock',
            'menu.view',
            'orders.create',
            'orders.manage',
            'orders.receipts',
            'orders.refund',
            'orders.refund_request',
            'orders.send_payment_link',
            'orders.send_sms_bill',
            'orders.update',
            'orders.view',
            'orders.void',
            'payments.card',
            'payments.cash',
            'payments.cash_in_out',
            'payments.cash_manage',
            'payments.credit',
            'payments.deposit',
            'payments.split',
            'payments.wallet',
            'pos.access',
            'pos.active_orders',
            'pos.close_shift',
            'pos.hold_resume',
            'pos.lock_screen',
            'pos.manage_order_status',
            'pos.open_shift',
            'pos.ring_sales',
            'pos.time_clock',
            'pos.view_all_station_orders',
            'pos.view_this_device_orders',
            'promotions.apply_promo_code',
            'promotions.discount_override',
            'promotions.discounts',
            'promotions.manage',
            'promotions.view',
            'purchase_requests.approve',
            'purchase_requests.assign',
            'purchase_requests.buy',
            'purchase_requests.cancel',
            'purchase_requests.convert_to_expense',
            'purchase_requests.convert_to_purchase',
            'purchase_requests.create',
            'purchase_requests.merge',
            // Managers hold `verify`, which satisfies this by alias — it is
            // listed explicitly so the allowlist records a decision rather
            // than leaving it to the alias table.
            'purchase_requests.receive',
            'purchase_requests.reject',
            'purchase_requests.verify',
            'purchase_requests.view_all',
            'purchase_requests.view_own',
            'reports.basic',
            'reports.financial',
            'reports.gst',
            'reports.inventory',
            'reports.sales',
            'reports.view',
            'reports.xreport',
            'reports.zreport',
            'reservations.manage',
            'reservations.view',
            'service_availability.manage_public',
            'service_availability.notify',
            'service_availability.restore',
            'service_availability.schedule',
            'service_availability.view',
            'settings.update',
            'shifts.view_all_history',
            'shifts.view_own_history',
            'signage.manage',
            'social.compose',
            'social.publish',
            'social.schedule',
            'social.view',
            'sms.campaigns.send',
            'sms.contacts.manage',
            'sms.logs.view',
            'sms.scheduled.manage',
            'sms.settings.manage',
            'sms.templates.edit',
            'sms.transactional.manage',
            'sms_marketing.manage',
            'sms_marketing.view',
            'staff.schedule',
            'staff.update',
            'staff.view',
            'suppliers.manage',
            'suppliers.purchases',
            'suppliers.view',
            'users.update',
            'users.view',
        ];
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
            // Owner, 2026-09-05: the box arrives at the back door and the
            // person standing there is a cook or a cashier, not a manager.
            // Accepting it is guarded by who bought it, not by rank — see
            // PurchaseRequestVerificationService.
            'purchase_requests.receive',
        ];
    }

    /** @return list<string> */
    public static function staffSlugs(): array
    {
        return [
            'pos.access', 'pos.open_shift', 'pos.close_shift', 'pos.lock_screen', 'pos.time_clock',
            'pos.ring_sales', 'pos.hold_resume', 'pos.active_orders', 'pos.manage_order_status', 'pos.view_this_device_orders',
            'orders.create', 'orders.view', 'orders.update', 'orders.receipts',
            'orders.refund_request',
            'orders.send_sms_bill', 'orders.send_payment_link',
            'payments.cash', 'payments.card', 'payments.split', 'payments.credit', 'payments.wallet', 'payments.deposit',
            'payments.cash_manage', 'payments.cash_in_out', 'finance.cash_manage',
            'customers.view', 'customers.lookup', 'customers.create',
            'loyalty.view', 'loyalty.redeem',
            'promotions.view', 'promotions.discounts', 'promotions.apply_promo_code',
            // shifts.view_own_history intentionally omitted (owner, 2026-09-01):
            // shift history exposes daily sales / discounts / refunds, which is
            // manager territory. Grant per-user for a trusted senior cashier.
            // reports.view / reports.basic intentionally omitted — owner/manager
            // defaults only; grant per-user when a cashier needs POS/Admin reports.
            'dashboard.view',
            'inventory.view', 'inventory.stock_count', 'suppliers.view', 'delivery.view', 'reservations.view',
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
