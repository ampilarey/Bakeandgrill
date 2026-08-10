<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hard-delete every order and dependent rows. For staging resets only.
 *
 * Tables that are purely order-scoped are truncated. Tables that also hold
 * non-order rows (Stage D trade invoice payments; gift-card ledger loads)
 * are selectively deleted by order_id IS NOT NULL.
 */
class PurgeOrdersCommand extends Command
{
    protected $signature = 'orders:purge
                            {--force : Skip confirmation prompt}
                            {--allow-production : Required on the live public_html install}';

    protected $description = 'Permanently delete all orders and related payment/kitchen/receipt data';

    /**
     * Tables truncated before orders (child → parent order).
     * Every row in these tables belongs to an order.
     *
     * @var list<string>
     */
    private const TRUNCATE_FIRST = [
        'order_item_modifiers',
        'order_items',
        // payments — NOT truncated: invoice_id rows are wholesale receivables
        'refunds',
        'receipts',
        'order_promotions',
        'promotion_redemptions',
        'loyalty_holds',
        'staff_notification_logs',
        // gift_card_transactions — NOT truncated: load/top-up/void have null order_id
    ];

    /**
     * Tables that mix order-scoped and non-order rows. Delete only where
     * order_id is set; leave the rest (invoice payments, gift-card loads).
     *
     * @var list<string>
     */
    private const DELETE_ORDER_SCOPED = [
        'payments',
        'gift_card_transactions',
    ];

    /** Test install on sg-s2 is always allowed; live public_html needs --allow-production. */
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
        if ($this->isLiveProductionInstall() && ! $this->option('allow-production')) {
            $this->error('Refusing to purge on the live site (public_html).');
            $this->line('Install path: '.base_path());
            $this->line('Pass --allow-production only if you intend to wipe the LIVE site.');

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm('Delete ALL orders permanently? This cannot be undone.')) {
            $this->info('Cancelled.');

            return self::SUCCESS;
        }

        $before = (int) DB::table('orders')->count();

        Schema::disableForeignKeyConstraints();

        try {
            // Order-scoped SMS idempotency keys use order_number, but legacy rows
            // keyed by order id will block payment-confirmation SMS after IDs reset.
            if (Schema::hasTable('sms_logs')) {
                DB::table('sms_logs')->where('reference_type', 'order')->delete();
            }

            foreach (self::TRUNCATE_FIRST as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }

            $this->deleteOrderScopedMixedTables();

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

    private function deleteOrderScopedMixedTables(): void
    {
        foreach (self::DELETE_ORDER_SCOPED as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'order_id')) {
                continue;
            }

            $deleted = (int) DB::table($table)->whereNotNull('order_id')->delete();
            $kept = (int) DB::table($table)->count();

            if ($table === 'payments') {
                $keptInvoice = Schema::hasColumn($table, 'invoice_id')
                    ? (int) DB::table($table)->whereNotNull('invoice_id')->whereNull('order_id')->count()
                    : $kept;
                $this->line("Payments: deleted {$deleted} order payment(s); kept {$keptInvoice} invoice payment(s).");
            } else {
                $this->line(sprintf(
                    '%s: deleted %d order-linked row(s); kept %d non-order row(s).',
                    $table,
                    $deleted,
                    $kept,
                ));
            }
        }
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
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }

            DB::table($table)->whereNotNull($column)->update([$column => null]);
        }
    }
}
