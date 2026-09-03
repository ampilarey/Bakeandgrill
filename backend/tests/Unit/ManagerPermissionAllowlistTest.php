<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Permissions\PermissionCatalog;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Hardens manager defaults: explicit allowlist must stay byte-identical to the
 * pre-hardening effective set, and every new catalog slug must be decided
 * (manager allowlist OR owner-only list).
 */
class ManagerPermissionAllowlistTest extends TestCase
{
    /**
     * Frozen snapshot of managerSlugs() immediately before converting from
     * ownerSlugs()-minus-exclusions to an explicit allowlist (2026-08-10).
     * Do not "fix" a mismatch by editing this list — that would change what
     * managers can do.
     *
     * @var list<string>
     */
    private const PRE_HARDENING_MANAGER_SLUGS = [
        'admin.access',
        'customers.analytics',
        'customers.create',
        'customers.credit.manage',
        // Added 2026-09-03 on the owner's explicit decision, not to make a
        // mismatch go away: a manager who may approve credit may now also
        // record the repayment. See docs/AUDIT_CREDIT_SETUP_2026-09-03.md (F2).
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
        // Social Hub (2026-08-28, intentional): posting workflow is
        // manager-grantable; social.channels.manage (tokens) stays owner-only.
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

    #[Test]
    public function explicit_manager_allowlist_matches_pre_hardening_effective_set(): void
    {
        $actual = PermissionCatalog::managerSlugs();
        sort($actual);

        $expected = self::PRE_HARDENING_MANAGER_SLUGS;
        sort($expected);

        $this->assertSame(
            $expected,
            $actual,
            'managerSlugs() no longer matches the pre-hardening effective set. '
            . 'Do not edit the fixture to silence this — investigate which slug was added or removed.',
        );
    }

    #[Test]
    public function every_catalog_slug_is_manager_or_documented_owner_only(): void
    {
        $catalog = PermissionCatalog::ownerSlugs();
        $manager = PermissionCatalog::managerSlugs();
        $ownerOnly = PermissionCatalog::ownerOnlySlugs();

        $undecided = [];
        foreach ($catalog as $slug) {
            $inManager = in_array($slug, $manager, true);
            $inOwnerOnly = in_array($slug, $ownerOnly, true);
            if ($inManager === $inOwnerOnly) {
                // Both true (overlap) or both false (undecided).
                $undecided[] = $slug;
            }
        }

        $this->assertSame(
            [],
            $undecided,
            'Decide whether managers get these permissions — add each slug to managerSlugs() '
            . 'or to the owner-only list (PermissionCatalog::ownerOnlySlugs()). Undecided: '
            . implode(', ', $undecided),
        );
    }

    #[Test]
    public function manager_and_owner_only_lists_do_not_overlap(): void
    {
        $overlap = array_values(array_intersect(
            PermissionCatalog::managerSlugs(),
            PermissionCatalog::ownerOnlySlugs(),
        ));

        $this->assertSame([], $overlap, 'Slug listed as both manager and owner-only: ' . implode(', ', $overlap));
    }
}
