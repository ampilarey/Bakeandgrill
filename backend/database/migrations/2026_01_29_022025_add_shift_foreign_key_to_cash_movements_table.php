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
        if (!Schema::hasTable('shifts') || !Schema::hasColumn('cash_movements', 'shift_id')) {
            return;
        }

        Schema::table('cash_movements', function (Blueprint $table) {
            $table->foreign('shift_id')
                ->references('id')
                ->on('shifts')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('cash_movements') || !Schema::hasColumn('cash_movements', 'shift_id')) {
            return;
        }

        Schema::table('cash_movements', function (Blueprint $table) {
            $table->dropForeign(['shift_id']);
        });
    }
};
