<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // Stock tracking
            $table->integer('stock_quantity')->default(0)->after('base_price');
            $table->integer('low_stock_threshold')->default(5)->after('stock_quantity');
            $table->boolean('track_stock')->default(false)->after('low_stock_threshold');
            
            // Item availability types
            $table->enum('availability_type', [
                'always',           // Always available (default)
                'stock_based',      // Available based on stock
                'made_to_order',    // Made upon request (tea, drinks)
                'pre_order_only'    // Only available for pre-order
            ])->default('always')->after('is_available');
            
            // Pre-order settings
            $table->boolean('allow_pre_order')->default(false)->after('availability_type');
            $table->integer('pre_order_lead_time_minutes')->nullable()->after('allow_pre_order'); // How long to prepare
            
            $table->index('track_stock');
            $table->index('availability_type');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn([
                'stock_quantity',
                'low_stock_threshold',
                'track_stock',
                'availability_type',
                'allow_pre_order',
                'pre_order_lead_time_minutes',
            ]);
        });
    }
};
