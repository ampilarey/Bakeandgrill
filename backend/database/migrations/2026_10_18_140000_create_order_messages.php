<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Messages between a customer and the shop about one order (iruali import plan, feature 9). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('sender', 16); // customer | staff
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->string('photo_path')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->foreignId('complaint_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->index(['order_id', 'created_at']);
            $table->index(['sender', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_messages');
    }
};
