<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Telegram group feeds (owner, 2026-10-07: "Do it", on the online orders
 * feed). The bot is added to a shop group; each paid online order is posted
 * there as a card with Start / Ready buttons, and the card follows the
 * order wherever it is moved on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telegram_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('telegram_bot_id')->constrained('telegram_bots')->cascadeOnDelete();
            $table->string('chat_id', 32);
            $table->string('title', 128)->nullable();
            $table->json('feeds');                  // online_orders
            $table->boolean('is_enabled')->default(true);
            $table->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('last_error')->nullable();
            $table->timestamp('last_posted_at')->nullable();
            $table->timestamps();

            $table->unique(['telegram_bot_id', 'chat_id']);
        });

        Schema::create('telegram_group_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('telegram_group_id')->constrained('telegram_groups')->cascadeOnDelete();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->unsignedBigInteger('message_id');
            $table->json('acted')->nullable();      // status => who pressed it on Telegram
            $table->timestamps();

            $table->unique(['telegram_group_id', 'order_id']);
            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram_group_posts');
        Schema::dropIfExists('telegram_groups');
    }
};
