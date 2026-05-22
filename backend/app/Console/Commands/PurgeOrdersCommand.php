<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hard-delete every order and dependent rows. For staging resets only.
 */
class PurgeOrdersCommand extends Command
{
    protected $signature = 'orders:purge
                            {--force : Skip confirmation prompt}
                            {--allow-production : Required on the live public_html install}';

    protected $description = 'Permanently delete all orders and related payment/kitchen/receipt data';

    /** Live site path on sg-s2 — test.bakeandgrill.mv is allowed without extra flags. */
    private function isLiveProductionInstall(): bool
    {
        return str_contains(base_path(), '/public_html/');
    }

    /** @var list<string> Tables truncated before orders (child → parent order). */
    private const TRUNCATE_FIRST = [
        'order_item_modifiers',
        'order_items',
        'payments',
        'refunds',
        'receipts',
        'order_promotions',
        'promotion_redemptions',
        'loyalty_holds',
        'staff_notification_logs',
        'gift_card_transactions',
    ];

    public function handle(): int
    {
        if (app()->environment('production') && !$this->option('allow-production')) {
            $this->error('Refusing to purge on production. Pass --allow-production if you really mean it.');

            return self::FAILURE;
        }

        if (!$this->option('force') && !$this->confirm('Delete ALL orders permanently? This cannot be undone.')) {
            $this->info('Cancelled.');

            return self::SUCCESS;
        }

        $before = (int) DB::table('orders')->count();

        Schema::disableForeignKeyConstraints();

        try {
            foreach (self::TRUNCATE_FIRST as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }

            $this->nullOrderReferences();

            if (Schema::hasTable('orders')) {
                DB::table('orders')->truncate();
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'last_order_at')) {
            DB::table('customers')->update(['last_order_at' => null]);
        }

        $this->info("Purged {$before} order(s) and related rows.");

        return self::SUCCESS;
    }

    private function nullOrderReferences(): void
    {
        $nullable = [
            'loyalty_ledger' => 'order_id',
            'print_jobs' => 'order_id',
            'invoices' => 'order_id',
            'reviews' => 'order_id',
            'referrals' => 'order_id',
            'stock_reservations' => 'order_id',
        ];

        foreach ($nullable as $table => $column) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
                continue;
            }

            DB::table($table)->whereNotNull($column)->update([$column => null]);
        }
    }
}
