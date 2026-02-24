<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creates the loyalty domain tables:
 *   - loyalty_accounts: per-customer running balance
 *   - loyalty_ledger: immutable transaction log
 *   - loyalty_holds: reservation of points before payment
 *   - loyalty_rules: configurable earning rules
 *   - loyalty_tiers: tier thresholds and multipliers
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_accounts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('points_balance')->default(0);
            $table->unsignedInteger('points_held')->default(0);
            $table->unsignedInteger('lifetime_points')->default(0);
            $table->string('tier')->default('bronze');
            $table->timestamps();
        });

        Schema::create('loyalty_ledger', function (Blueprint $table): void {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // earn | redeem | adjust | expire | bonus
            $table->integer('points'); // positive = credit, negative = debit
            $table->unsignedInteger('balance_after');
            $table->string('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['customer_id', 'occurred_at']);
            $table->index(['order_id', 'type']);
        });

        Schema::create('loyalty_holds', function (Blueprint $table): void {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('points_held');
            $table->integer('discount_laar');
            $table->string('status')->default('active'); // active | consumed | released | expired
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index('expires_at');
        });

        Schema::create('loyalty_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('event'); // order_completed | referral | birthday | etc.
            $table->integer('points_per_100_laar')->default(1);
            $table->decimal('multiplier', 5, 2)->default(1.0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('loyalty_tiers', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->unsignedInteger('min_lifetime_points')->default(0);
            $table->decimal('earn_multiplier', 5, 2)->default(1.0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_tiers');
        Schema::dropIfExists('loyalty_rules');
        Schema::dropIfExists('loyalty_holds');
        Schema::dropIfExists('loyalty_ledger');
        Schema::dropIfExists('loyalty_accounts');
    }
};
