<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_special_sold_count_refund_logs', function (Blueprint $table): void {
            $table->id();
            // No FK on refund_id — mirrors sold_count_logs (order_id only) and
            // allows idempotency even if the refund row is later purged.
            $table->unsignedBigInteger('refund_id')->unique();
            $table->unsignedBigInteger('order_id')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_special_sold_count_refund_logs');
    }
};
