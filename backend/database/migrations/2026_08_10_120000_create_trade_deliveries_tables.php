<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage B+C — trade delivery notes + lines (dispatch & reconciliation).
 * See docs/WHOLESALE_CONSIGNMENT_PLAN.md §3.3–3.4. Money does not move here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trade_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trade_account_id')->constrained('trade_accounts')->cascadeOnDelete();
            $table->string('delivery_number')->unique();
            $table->string('status', 32)->default('draft'); // draft|dispatched|reconciled|cancelled
            $table->timestamp('dispatched_at')->nullable();
            $table->foreignId('dispatched_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('driver_name')->nullable();
            $table->timestamp('expected_return_at')->nullable();
            $table->timestamp('reconciled_at')->nullable();
            $table->foreignId('reconciled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->foreignId('signature_media_id')->nullable()->constrained('media_assets')->nullOnDelete();
            $table->string('idempotency_key')->unique();
            $table->boolean('has_mismatch')->default(false);
            $table->boolean('self_reconciled')->default(false);
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reported_at')->nullable();
            $table->text('credit_override_reason')->nullable();
            $table->foreignId('credit_override_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'dispatched_at']);
            $table->index('trade_account_id');
        });

        Schema::create('trade_delivery_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trade_delivery_id')->constrained('trade_deliveries')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->restrictOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('variants')->nullOnDelete();
            $table->unsignedInteger('qty_sent');
            $table->unsignedInteger('unit_price_laar'); // stamped at dispatch, GST-inclusive
            $table->unsignedInteger('unit_cost_laar'); // stamped at dispatch
            $table->unsignedInteger('qty_sold')->default(0);
            $table->unsignedInteger('qty_returned_good')->default(0);
            $table->unsignedInteger('qty_returned_waste')->default(0);
            $table->unsignedInteger('qty_missing')->default(0);
            $table->unsignedInteger('reported_sold_qty')->nullable();
            $table->unsignedInteger('counted_return_qty')->nullable();
            $table->string('return_condition', 32)->nullable();
            $table->string('return_action', 32)->nullable(); // accept_to_stock|reject_to_waste
            $table->string('return_idempotency_key')->nullable()->unique();
            $table->timestamps();

            $table->index('trade_delivery_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trade_delivery_lines');
        Schema::dropIfExists('trade_deliveries');
    }
};
