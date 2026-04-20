<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_notification_prefs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->boolean('notifications_enabled')->default(true);
            $table->json('order_types')->nullable();
            $table->json('menu_group_ids')->nullable();
            $table->json('category_ids')->nullable();
            $table->boolean('is_fallback')->default(false);
            $table->unsignedSmallInteger('fallback_priority')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_notification_prefs');
    }
};
