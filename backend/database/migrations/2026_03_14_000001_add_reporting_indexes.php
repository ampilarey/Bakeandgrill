<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->index('processed_at');
            $table->index('reference_number');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->index(['status', 'created_at']);
            $table->index('customer_id');
            $table->index('shift_id');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->index('item_id');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['processed_at']);
            $table->dropIndex(['reference_number']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['status', 'created_at']);
            $table->dropIndex(['customer_id']);
            $table->dropIndex(['shift_id']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex(['item_id']);
        });
    }
};
