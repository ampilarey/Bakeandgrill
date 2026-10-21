<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\SmsTemplateWording;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A family wallet (phase 4, owner 2026-10-21): a customer shares their wallet
 * with up to four others, who pay from it when their own is empty. The
 * ledger keeps who spent (spent_by_customer_id) beside whose wallet it was.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('member_customer_id')->unique()->constrained('customers')->cascadeOnDelete();
            $table->timestamps();
            $table->index('owner_customer_id');
        });

        if (!Schema::hasColumn('customer_deposit_ledger', 'spent_by_customer_id')) {
            Schema::table('customer_deposit_ledger', function (Blueprint $table) {
                $table->foreignId('spent_by_customer_id')->nullable()->after('customer_id')->constrained('customers')->nullOnDelete();
            });
        }

        SmsTemplateWording::ensure([
            'slug' => 'customer_wallet_shared',
            'name' => 'Wallet: shared with you (customer)',
            'body' => 'Bake & Grill: {{owner}} shares their wallet with you. When your own wallet is empty, you can pay from it at the counter and in the order app.',
            'description' => 'Sent to a customer when another customer shares their wallet with them.',
            'variables' => [
                ['name' => 'owner', 'description' => 'The name of the customer whose wallet it is'],
                ['name' => 'name', 'description' => 'Customer name'],
            ],
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_wallet_member_spend',
            'name' => 'Wallet: a family member paid from it (customer)',
            'body' => 'Bake & Grill: MVR {{amount}} paid from your wallet by {{member}} for #{{order_number}}. Wallet balance: MVR {{balance}}.',
            'description' => 'Sent to the wallet\'s owner when someone they share it with pays from it.',
            'variables' => [
                ['name' => 'amount', 'description' => 'Amount in MVR'],
                ['name' => 'member', 'description' => 'Who paid'],
                ['name' => 'order_number', 'description' => 'Order number'],
                ['name' => 'balance', 'description' => 'Wallet balance after, in MVR'],
                ['name' => 'name', 'description' => 'Customer name'],
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('sms_templates')->whereIn('slug', ['customer_wallet_shared', 'customer_wallet_member_spend'])->delete();
        if (Schema::hasColumn('customer_deposit_ledger', 'spent_by_customer_id')) {
            Schema::table('customer_deposit_ledger', function (Blueprint $table) {
                $table->dropForeign(['spent_by_customer_id']);
                $table->dropColumn('spent_by_customer_id');
            });
        }
        Schema::dropIfExists('wallet_members');
    }
};
