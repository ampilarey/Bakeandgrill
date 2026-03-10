<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Referral codes
        Schema::create('referral_codes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('code', 20)->unique();
            $table->unsignedSmallInteger('uses_count')->default(0);
            $table->unsignedSmallInteger('max_uses')->nullable();
            $table->decimal('referrer_reward_mvr', 8, 2)->default(0);
            $table->decimal('referee_discount_mvr', 8, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('code');
        });

        // Referral tracking
        Schema::create('referrals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('referral_code_id')->constrained('referral_codes')->cascadeOnDelete();
            $table->foreignId('referee_customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->boolean('reward_paid')->default(false);
            $table->timestamps();

            $table->unique(['referral_code_id', 'referee_customer_id']);
        });

        // Gift cards
        Schema::create('gift_cards', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 20)->unique();
            $table->decimal('initial_balance', 10, 2);
            $table->decimal('current_balance', 10, 2);
            $table->foreignId('issued_to_customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('purchased_by_customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->enum('status', ['active', 'expired', 'depleted'])->default('active');
            $table->date('expires_at')->nullable();
            $table->timestamps();

            $table->index('code');
            $table->index('status');
        });

        // Gift card transactions
        Schema::create('gift_card_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('gift_card_id')->constrained('gift_cards')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->enum('type', ['load', 'redeem', 'refund']);
            $table->decimal('balance_after', 10, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gift_card_transactions');
        Schema::dropIfExists('gift_cards');
        Schema::dropIfExists('referrals');
        Schema::dropIfExists('referral_codes');
    }
};
