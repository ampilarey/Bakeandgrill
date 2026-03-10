<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->unsignedTinyInteger('rating');         // 1-5
            $table->text('comment')->nullable();
            $table->enum('type', ['order', 'item'])->default('order');
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('approved');
            $table->boolean('is_anonymous')->default(false);
            $table->timestamps();

            $table->index(['item_id', 'status']);
            $table->index(['customer_id']);
            $table->unique(['customer_id', 'order_id', 'item_id'], 'unique_review');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};
