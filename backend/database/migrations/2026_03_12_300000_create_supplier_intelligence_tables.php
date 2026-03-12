<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Supplier ratings & feedback
        Schema::create('supplier_ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->unsignedTinyInteger('quality_score');    // 1–5
            $table->unsignedTinyInteger('delivery_score');   // 1–5
            $table->unsignedTinyInteger('accuracy_score');   // 1–5
            $table->unsignedTinyInteger('price_score');      // 1–5
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Price history per supplier per inventory item
        Schema::create('supplier_price_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('unit_price', 10, 4);
            $table->string('unit')->nullable();
            $table->date('recorded_at');
            $table->timestamps();

            $table->index(['inventory_item_id', 'recorded_at']);
            $table->index(['supplier_id', 'recorded_at']);
        });

        // Aggregate supplier performance cache (refresh daily)
        Schema::create('supplier_performance_cache', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('purchase_count')->default(0);
            $table->decimal('total_spend', 14, 2)->default(0);
            $table->decimal('avg_quality', 5, 2)->nullable();
            $table->decimal('avg_delivery', 5, 2)->nullable();
            $table->decimal('avg_accuracy', 5, 2)->nullable();
            $table->decimal('avg_price_score', 5, 2)->nullable();
            $table->decimal('overall_rating', 5, 2)->nullable();
            $table->unsignedInteger('on_time_deliveries')->default(0);
            $table->unsignedInteger('total_deliveries')->default(0);
            $table->date('period_from')->nullable();
            $table->date('period_to')->nullable();
            $table->timestamp('refreshed_at')->nullable();
            $table->timestamps();

            $table->unique('supplier_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_performance_cache');
        Schema::dropIfExists('supplier_price_history');
        Schema::dropIfExists('supplier_ratings');
    }
};
