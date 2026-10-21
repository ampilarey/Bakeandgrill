<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\SmsTemplateWording;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 4 of the deposit plan (owner, 2026-10-21): a bonus on a top-up is a
 * wallet ledger row of its own (type bonus), a customer may have their credit
 * settled from their wallet every night, and the "money added" text may carry
 * the bonus.
 */
return new class extends Migration
{
    private const TYPES = [
        'top_up', 'usage', 'refund', 'adjustment',
        'adjustment_add', 'adjustment_deduct', 'transfer_to_credit', 'reversal', 'payout',
        'bonus',
    ];

    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'credit_settle_from_wallet')) {
                $table->boolean('credit_settle_from_wallet')->default(false);
            }
        });

        $driver = Schema::getConnection()->getDriverName();
        $allowed = "'" . implode("', '", self::TYPES) . "'";
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE customer_deposit_ledger MODIFY COLUMN type ENUM({$allowed}) NOT NULL");
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE customer_deposit_ledger DROP CONSTRAINT IF EXISTS customer_deposit_ledger_type_check');
            DB::statement("ALTER TABLE customer_deposit_ledger ADD CONSTRAINT customer_deposit_ledger_type_check CHECK (type::text IN ({$allowed}))");
        }

        SmsTemplateWording::replaceIfUnchanged('customer_deposit_received', [], '', [
            ['name' => 'amount', 'description' => 'Amount in MVR'],
            ['name' => 'method', 'description' => 'How it was paid (cash, card, bank transfer, online)'],
            ['name' => 'balance', 'description' => 'Wallet balance after, in MVR'],
            ['name' => 'receipt', 'description' => 'The receipt page for a card top-up (blank otherwise; added at the end when the wording has no place for it)'],
            ['name' => 'bonus_note', 'description' => '" Plus a MVR x bonus." when a bonus was added (blank otherwise; added at the end when the wording has no place for it)'],
        ]);
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('credit_settle_from_wallet');
        });
        // The ledger type list stays widened: narrowing it would fail once bonus rows exist.
    }
};
