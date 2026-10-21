<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\SmsTemplateWording;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Spending the wallet and the credit account better (owner, 2026-10-21):
 * the customer may put the wallet first at checkout and pay part of an
 * order from it (a hold, taken when the card pays the rest); the credit
 * account has a statement page with its own token, and a payment of the
 * whole balance online is a credit_payments row the card payment points at,
 * as a wallet top-up is. A statement text goes out monthly.
 */
return new class extends Migration
{
    private const XOR_NAME = 'payments_order_xor_invoice_chk';

    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'wallet_first')) {
                $table->boolean('wallet_first')->default(false);
            }
            if (!Schema::hasColumn('customers', 'credit_statement_token')) {
                $table->string('credit_statement_token', 64)->nullable()->unique();
            }
        });

        Schema::create('credit_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->unsignedInteger('amount_laar');
            // pending, paid, expired, cancelled
            $table->string('status', 16)->default('pending');
            // app: Account → Credit in the order app; statement: the public statement page.
            $table->string('source', 12)->default('app');
            $table->foreignId('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->foreignId('ledger_id')->nullable()->constrained('customer_credit_ledger')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->index(['customer_id', 'status']);
            $table->index(['status', 'expires_at']);
        });

        if (!Schema::hasColumn('payments', 'credit_payment_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->foreignId('credit_payment_id')->nullable()->after('wallet_topup_id')
                    ->constrained('credit_payments')->nullOnDelete();
            });
        }

        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            if ($this->xorExists()) {
                DB::statement('ALTER TABLE payments DROP CONSTRAINT ' . self::XOR_NAME);
            }
            try {
                DB::statement('ALTER TABLE payments ADD CONSTRAINT ' . self::XOR_NAME . ' CHECK (
                    (`order_id` IS NOT NULL AND `invoice_id` IS NULL AND `wallet_topup_id` IS NULL AND `credit_payment_id` IS NULL)
                    OR (`order_id` IS NULL AND `invoice_id` IS NOT NULL AND `wallet_topup_id` IS NULL AND `credit_payment_id` IS NULL)
                    OR (`order_id` IS NULL AND `invoice_id` IS NULL AND `wallet_topup_id` IS NOT NULL AND `credit_payment_id` IS NULL)
                    OR (`order_id` IS NULL AND `invoice_id` IS NULL AND `wallet_topup_id` IS NULL AND `credit_payment_id` IS NOT NULL)
                )');
            } catch (Throwable $e) {
                // MariaDB error 1901: a CHECK may not name FK columns. The
                // services enforce the rule, as stage D already relied on.
                if (!str_contains($e->getMessage(), '1901') && !str_contains($e->getMessage(), 'cannot be used in the CHECK clause')) {
                    throw $e;
                }
            }
        }

        SmsTemplateWording::ensure([
            'slug' => 'customer_credit_statement',
            'name' => 'Credit account monthly statement (customer)',
            'body' => 'Bake & Grill: your credit account statement for {{month}}: you owe MVR {{balance}}{{overdue_note}}. Your invoices, and Pay online: {{link}}',
            'description' => 'Sent on the 1st to every customer who owes money on their credit account.',
            'variables' => [
                ['name' => 'month', 'description' => 'The statement month, e.g. September 2026'],
                ['name' => 'balance', 'description' => 'Everything owed in MVR'],
                ['name' => 'overdue', 'description' => 'The overdue part in MVR (0.00 when none)'],
                ['name' => 'overdue_note', 'description' => '", of which MVR x is overdue" or nothing'],
                ['name' => 'invoices', 'description' => 'How many invoices are open'],
                ['name' => 'link', 'description' => 'The statement page, with Pay online'],
                ['name' => 'name', 'description' => 'Customer name'],
            ],
        ]);
        // The charged text may warn when the limit is nearly used up.
        SmsTemplateWording::replaceIfUnchanged('customer_credit_charged', [], '', [
            ['name' => 'amount', 'description' => 'Amount charged to the account in MVR'],
            ['name' => 'order_number', 'description' => 'Order number'],
            ['name' => 'invoice_number', 'description' => 'Invoice number'],
            ['name' => 'due_date', 'description' => 'When the invoice is due'],
            ['name' => 'balance', 'description' => 'Balance owed on the account in MVR'],
            ['name' => 'available', 'description' => 'Credit still available in MVR'],
            ['name' => 'link', 'description' => 'Link to the invoice page, with Pay online'],
            ['name' => 'limit_note', 'description' => 'When a fifth or less of the limit is left: " Only MVR x of your MVR y limit is left." (blank otherwise; added at the end when the wording has no place for it)'],
        ]);
    }

    public function down(): void
    {
        DB::table('sms_templates')->where('slug', 'customer_credit_statement')->delete();

        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true) && $this->xorExists()) {
            DB::statement('ALTER TABLE payments DROP CONSTRAINT ' . self::XOR_NAME);
        }
        if (Schema::hasColumn('payments', 'credit_payment_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropForeign(['credit_payment_id']);
                $table->dropColumn('credit_payment_id');
            });
        }
        Schema::dropIfExists('credit_payments');
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['wallet_first', 'credit_statement_token']);
        });
    }

    private function xorExists(): bool
    {
        $row = DB::selectOne(
            'SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?',
            ['payments', self::XOR_NAME, 'CHECK'],
        );

        return $row !== null;
    }
};
