<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_deposit_ledger', function (Blueprint $table): void {
            $table->foreignId('deposit_account_id')->nullable()->after('customer_id')
                ->constrained('customer_deposit_accounts')->nullOnDelete();
            $table->unsignedBigInteger('balance_before_laar')->nullable()->after('amount_laar');
            $table->string('method', 32)->nullable()->after('type');
            $table->foreignId('refund_id')->nullable()->after('payment_id')
                ->constrained('refunds')->nullOnDelete();
            $table->string('reference', 200)->nullable()->after('notes');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE customer_deposit_ledger MODIFY COLUMN type ENUM(
                'top_up', 'usage', 'refund', 'adjustment',
                'adjustment_add', 'adjustment_deduct', 'transfer_to_credit', 'reversal', 'payout'
            ) NOT NULL");
        }

        if (Schema::hasTable('customer_deposit_accounts')) {
            $accounts = DB::table('customer_deposit_accounts')->select('id', 'customer_id')->get();
            foreach ($accounts as $account) {
                DB::table('customer_deposit_ledger')
                    ->where('customer_id', $account->customer_id)
                    ->whereNull('deposit_account_id')
                    ->update(['deposit_account_id' => $account->id]);
            }
        }

        Schema::table('customer_deposit_ledger', function (Blueprint $table): void {
            $table->index('deposit_account_id');
            $table->index('refund_id');
        });
    }

    public function down(): void
    {
        Schema::table('customer_deposit_ledger', function (Blueprint $table): void {
            $table->dropForeign(['deposit_account_id']);
            $table->dropForeign(['refund_id']);
            $table->dropIndex(['deposit_account_id']);
            $table->dropIndex(['refund_id']);
            $table->dropColumn(['deposit_account_id', 'balance_before_laar', 'method', 'refund_id', 'reference']);
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE customer_deposit_ledger MODIFY COLUMN type ENUM(
                'top_up', 'usage', 'refund', 'adjustment'
            ) NOT NULL");
        }
    }
};
