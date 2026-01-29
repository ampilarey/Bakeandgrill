<?php

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
        if (!Schema::hasTable('restaurant_tables') || !Schema::hasColumn('orders', 'restaurant_table_id')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->foreign('restaurant_table_id')
                ->references('id')
                ->on('restaurant_tables')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('orders') || !Schema::hasColumn('orders', 'restaurant_table_id')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropForeign(['restaurant_table_id']);
        });
    }
};
