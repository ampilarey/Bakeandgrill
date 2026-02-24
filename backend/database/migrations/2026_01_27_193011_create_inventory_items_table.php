<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('sku')->nullable()->unique();
            $table->string('unit')->default('pcs');
            $table->decimal('current_stock', 10, 2)->default(0);
            $table->decimal('reorder_point', 10, 2)->default(0);
            $table->decimal('unit_cost', 10, 2)->default(0);
            $table->decimal('last_purchase_price', 10, 2)->default(0);
            $table->date('expiry_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('sku');
            $table->index('current_stock');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inventory_items');
    }
};
