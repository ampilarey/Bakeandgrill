<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Customer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Remove operational data (orders, customers, sales, shifts, etc.)
 * while keeping schema, menu, staff, roles, and site settings.
 */
class StagingCleanCommand extends Command
{
    protected $signature = 'staging:clean
                            {--force : Skip confirmation prompt}
                            {--allow-production : Required on the live public_html install}';

    protected $description = 'Delete transactional data (orders, customers, sales, shifts) — keeps menu, staff & settings';

    /** @var list<string> Child tables first; each table is skipped if missing. */
    private const TRANSACTIONAL_TABLES = [
        'invoice_items',
        'invoices',
        'expenses',
        'purchase_receipts',
        'purchase_items',
        'purchases',
        'waste_logs',
        'stock_reservations',
        'stock_movements',
        'low_stock_alerts',
        'cash_movements',
        'time_punches',
        'shifts',
        'payment_attempts',
        'receipt_feedback',
        'print_jobs',
        'sms_campaign_recipients',
        'sms_promotion_recipients',
        'sms_scheduled_messages',
        'sms_promotions',
        'sms_campaigns',
        'sms_contact_group_members',
        'sms_contacts',
        'sms_contact_groups',
        'sms_logs',
        'abandoned_carts',
        'pre_orders',
        'reservations',
        'reviews',
        'referrals',
        'gift_cards',
        'referral_codes',
        'customer_tag_assignments',
        'customer_follow_up_notes',
        'customer_tags',
        'customer_favorites',
        'customer_addresses',
        'customer_credit_ledger',
        'push_subscriptions',
        'loyalty_ledger',
        'loyalty_accounts',
        'otp_verifications',
        'customers',
        'webhook_logs',
        'xero_sync_logs',
        'offline_sync_records',
        'daily_special_sold_count_logs',
        'daily_special_sold_count_refund_logs',
        'item_pair_stats',
        'catering_requests',
        'driver_locations',
        'supplier_ratings',
        'supplier_price_history',
        'supplier_performance_cache',
        'staff_schedules',
        'kitchen_menu_state',
        'daily_sequences',
        'audit_logs',
        'failed_jobs',
        'job_batches',
        'jobs',
    ];

    private function isLiveProductionInstall(): bool
    {
        $base = str_replace('\\', '/', base_path());

        if (str_contains($base, 'test.bakeandgrill')) {
            return false;
        }

        return str_contains($base, '/public_html');
    }

    public function handle(): int
    {
        if ($this->isLiveProductionInstall() && !$this->option('allow-production')) {
            $this->error('Refusing to clean on the live site (public_html).');
            $this->line('Install path: ' . base_path());
            $this->line('Pass --allow-production only if you intend to wipe the LIVE site.');

            return self::FAILURE;
        }

        if (!$this->option('force') && !$this->confirm(
            'Delete ALL orders, customers, sales, shifts, invoices, and related data? Menu, staff, and settings are kept. This cannot be undone.',
            false,
        )) {
            $this->info('Cancelled.');

            return self::SUCCESS;
        }

        $ordersBefore = Schema::hasTable('orders') ? (int) DB::table('orders')->count() : 0;
        $customersBefore = Schema::hasTable('customers') ? (int) DB::table('customers')->count() : 0;

        $purgeExit = Artisan::call('orders:purge', [
            '--force' => true,
            '--allow-production' => $this->option('allow-production'),
        ]);

        if ($purgeExit !== self::SUCCESS) {
            $this->error(trim(Artisan::output()) ?: 'orders:purge failed.');

            return self::FAILURE;
        }

        Schema::disableForeignKeyConstraints();

        try {
            DB::table('personal_access_tokens')
                ->where('tokenable_type', Customer::class)
                ->delete();

            foreach (self::TRANSACTIONAL_TABLES as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }

            $this->resetOperationalState();
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        $this->info("Clean complete. Removed {$ordersBefore} order(s) and {$customersBefore} customer(s).");
        $this->line('Kept: menu, staff users, roles, devices, site settings, suppliers, expense categories.');

        return self::SUCCESS;
    }

    private function resetOperationalState(): void
    {
        if (Schema::hasTable('restaurant_tables')) {
            DB::table('restaurant_tables')->update(['status' => 'available']);
        }

        if (Schema::hasTable('items') && Schema::hasColumn('items', 'stock_quantity')) {
            DB::table('items')->update(['stock_quantity' => 0]);
        }

        if (Schema::hasTable('inventory_items') && Schema::hasColumn('inventory_items', 'current_stock')) {
            DB::table('inventory_items')->update(['current_stock' => 0]);
        }

        if (Schema::hasTable('devices') && Schema::hasColumn('devices', 'last_user_id')) {
            DB::table('devices')->update(['last_user_id' => null]);
        }
    }
}
