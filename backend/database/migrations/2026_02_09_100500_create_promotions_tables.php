<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creates the promotions domain tables:
 *   - promotions: promo code definitions
 *   - promotion_targets: items/categories included or excluded
 *   - order_promotions: draft association (deleted on cancel)
 *   - promotion_redemptions: final record written on OrderPaid
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('type')->default('percentage'); // percentage | fixed | free_item
            $table->integer('discount_value')->default(0); // basis points for %, laari for fixed
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('max_uses_per_customer')->nullable();
            $table->unsignedInteger('redemptions_count')->default(0);
            $table->boolean('stackable')->default(false);
            $table->unsignedInteger('min_order_laar')->default(0);
            $table->string('scope')->default('order'); // order | item
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('promotion_targets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('promotion_id')->constrained()->cascadeOnDelete();
            $table->string('target_type'); // item | category
            $table->unsignedBigInteger('target_id');
            $table->boolean('is_exclusion')->default(false);
            $table->timestamps();

            $table->index(['promotion_id', 'target_type', 'target_id']);
        });

        Schema::create('order_promotions', function (Blueprint $table): void {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('promotion_id')->constrained()->cascadeOnDelete();
            $table->integer('discount_laar')->default(0);
            $table->string('status')->default('draft'); // draft | consumed | released
            $table->timestamps();

            $table->unique(['order_id', 'promotion_id']);
        });

        Schema::create('promotion_redemptions', function (Blueprint $table): void {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->foreignId('promotion_id')->constrained();
            $table->foreignId('order_id')->constrained();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('discount_laar')->default(0);
            $table->timestamp('redeemed_at');
            $table->timestamps();

            $table->unique(['promotion_id', 'order_id']);
            $table->index(['promotion_id', 'customer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_redemptions');
        Schema::dropIfExists('order_promotions');
        Schema::dropIfExists('promotion_targets');
        Schema::dropIfExists('promotions');
    }
};
