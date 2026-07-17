<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_reorder_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_item_id')->constrained('inventory_items')->cascadeOnDelete();
            $table->decimal('current_stock', 12, 3);
            $table->decimal('reorder_point', 12, 3);
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['inventory_item_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_reorder_alerts');
    }
};
