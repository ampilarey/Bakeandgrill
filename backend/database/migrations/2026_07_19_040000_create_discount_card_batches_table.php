<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('discount_card_batches')) {
            return;
        }

        Schema::create('discount_card_batches', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('type', 20); // percentage | fixed
            $table->unsignedInteger('discount_value'); // whole % or laari
            $table->unsignedInteger('min_order_laar')->default(0);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->unsignedInteger('max_uses_per_card')->default(1);
            $table->unsignedInteger('max_uses_per_customer')->nullable();
            $table->unsignedInteger('quantity');
            $table->string('note', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discount_card_batches');
    }
};
