<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Quick keys on the till.
 *
 * Owner, 2026-09-02: the POS shows categories and items in the admin's
 * order, "but usually pos used for dine in customers and certain items are
 * frequent in certain times … manually add/edit the categories and their
 * items for pos or each staff on his own".
 *
 * One row per pinned item. `user_id` null is the shared set every cashier
 * starts from; a row with a user is that person's own set, which replaces
 * the shared one for them once it has anything in it. Order is `sort_order`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pos_quick_keys', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos_quick_keys');
    }
};
