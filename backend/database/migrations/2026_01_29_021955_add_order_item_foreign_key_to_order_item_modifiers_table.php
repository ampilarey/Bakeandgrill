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
        if (!Schema::hasTable('order_items') || !Schema::hasColumn('order_item_modifiers', 'order_item_id')) {
            return;
        }

        Schema::table('order_item_modifiers', function (Blueprint $table) {
            $table->foreign('order_item_id')
                ->references('id')
                ->on('order_items')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('order_item_modifiers') || !Schema::hasColumn('order_item_modifiers', 'order_item_id')) {
            return;
        }

        Schema::table('order_item_modifiers', function (Blueprint $table) {
            $table->dropForeign(['order_item_id']);
        });
    }
};
