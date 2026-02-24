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
        if (!Schema::hasTable('suppliers') || !Schema::hasColumn('purchases', 'supplier_id')) {
            return;
        }

        Schema::table('purchases', function (Blueprint $table) {
            $table->foreign('supplier_id')
                ->references('id')
                ->on('suppliers')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('purchases') || !Schema::hasColumn('purchases', 'supplier_id')) {
            return;
        }

        Schema::table('purchases', function (Blueprint $table) {
            $table->dropForeign(['supplier_id']);
        });
    }
};
