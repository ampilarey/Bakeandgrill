<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * inventory_items.preferred_supplier_id was incorrectly created as varchar.
 * The suppliers.id FK is an unsigned big integer, so the JOIN never matched.
 * This migration changes the column to unsignedBigInteger so the relationship works.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('inventory_items', 'preferred_supplier_id')) {
            return;
        }

        Schema::table('inventory_items', function (Blueprint $table): void {
            // Drop any existing FK constraint on this column before changing type
            try {
                $table->dropForeign(['preferred_supplier_id']);
            } catch (\Throwable) {
                // No FK existed — safe to ignore
            }

            $table->unsignedBigInteger('preferred_supplier_id')
                ->nullable()
                ->change();

            $table->foreign('preferred_supplier_id')
                ->references('id')
                ->on('suppliers')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('inventory_items', 'preferred_supplier_id')) {
            return;
        }

        Schema::table('inventory_items', function (Blueprint $table): void {
            try {
                $table->dropForeign(['preferred_supplier_id']);
            } catch (\Throwable) {}

            $table->string('preferred_supplier_id')->nullable()->change();
        });
    }
};
