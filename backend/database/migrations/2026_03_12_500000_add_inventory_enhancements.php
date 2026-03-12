<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Inventory categories
        Schema::create('inventory_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Unit conversion table
        Schema::create('unit_conversions', function (Blueprint $table) {
            $table->id();
            $table->string('from_unit');
            $table->string('to_unit');
            $table->decimal('factor', 14, 6);
            $table->timestamps();

            $table->unique(['from_unit', 'to_unit']);
        });

        // Additions to inventory_items
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->foreignId('inventory_category_id')->nullable()->after('id')->constrained('inventory_categories')->nullOnDelete();
            $table->string('preferred_supplier_id')->nullable()->after('last_purchase_price');
            $table->decimal('reorder_quantity', 10, 3)->nullable()->after('reorder_point');
            $table->string('storage_location')->nullable()->after('reorder_quantity');
            $table->text('notes')->nullable()->after('storage_location');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn(['inventory_category_id', 'preferred_supplier_id', 'reorder_quantity', 'storage_location', 'notes']);
        });
        Schema::dropIfExists('unit_conversions');
        Schema::dropIfExists('inventory_categories');
    }
};
