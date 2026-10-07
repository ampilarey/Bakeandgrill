<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Cards the bot sent about something that changes later (a buying list
 * request), so every copy can be brought up to date: the approvers', the
 * buyer's and the group's (owner, 2026-10-07: "Next", the cashier level and
 * the buying list).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telegram_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('telegram_bot_id')->constrained('telegram_bots')->cascadeOnDelete();
            $table->string('chat_id', 32);
            $table->unsignedBigInteger('message_id');
            $table->string('subject', 32);          // purchase_request
            $table->unsignedBigInteger('subject_id');
            $table->string('kind', 16);             // approver, buyer, group
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['subject', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram_messages');
    }
};
