<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage A — wholesale consignment: trade accounts + price lists.
 * See docs/WHOLESALE_CONSIGNMENT_PLAN.md §3.1–3.2.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trade_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('shop_name');
            $table->string('contact_name')->nullable();
            $table->string('contact_phone')->nullable();
            $table->string('settlement_mode', 32)->default('sale_or_return');
            $table->string('billing_cycle', 32)->default('monthly');
            $table->unsignedSmallInteger('payment_terms_days')->nullable();
            $table->string('missing_policy', 32)->default('charge');
            $table->unsignedInteger('default_discount_bp')->nullable();
            $table->json('delivery_days')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique('customer_id');
            $table->index('is_active');
        });

        Schema::create('trade_price_list_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trade_account_id')->constrained('trade_accounts')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('variants')->nullOnDelete();
            $table->unsignedInteger('price_laar');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(
                ['trade_account_id', 'item_id', 'variant_id'],
                'trade_price_list_account_item_variant_unique',
            );
        });

        Schema::table('items', function (Blueprint $table) {
            $table->unsignedInteger('wholesale_price_laar')->nullable()->after('base_price');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('wholesale_price_laar');
        });
        Schema::dropIfExists('trade_price_list_entries');
        Schema::dropIfExists('trade_accounts');
    }
};
