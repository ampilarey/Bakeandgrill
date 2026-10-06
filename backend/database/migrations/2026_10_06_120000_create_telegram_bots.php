<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Telegram staff bots (owner, 2026-10-06: "Build owner bot now, then
 * manager, then staff"). A bot serves one or more roles; each staff member
 * or driver links their own Telegram once with a one-time code; alerts and
 * commands then reach them there.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telegram_bots', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->text('token');                       // encrypted
            $table->string('username', 64)->nullable();  // learned from getMe
            $table->unsignedBigInteger('bot_user_id')->nullable();
            $table->json('roles');                       // owner, manager, staff, kitchen_staff, driver
            $table->string('webhook_secret', 64);
            $table->boolean('is_enabled')->default(true);
            $table->timestamp('last_checked_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        Schema::create('telegram_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('telegram_bot_id')->constrained('telegram_bots')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('delivery_driver_id')->nullable()->constrained('delivery_drivers')->cascadeOnDelete();
            $table->string('chat_id', 32);
            $table->string('telegram_username', 64)->nullable();
            $table->string('telegram_name', 128)->nullable();
            $table->timestamp('linked_at');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('blocked_at')->nullable(); // the person blocked the bot
            $table->timestamps();

            $table->unique(['telegram_bot_id', 'chat_id']);
            $table->unique(['telegram_bot_id', 'user_id']);
            $table->unique(['telegram_bot_id', 'delivery_driver_id']);
        });

        Schema::create('telegram_link_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('telegram_bot_id')->constrained('telegram_bots')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('delivery_driver_id')->nullable()->constrained('delivery_drivers')->cascadeOnDelete();
            $table->string('code_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram_link_codes');
        Schema::dropIfExists('telegram_links');
        Schema::dropIfExists('telegram_bots');
    }
};
