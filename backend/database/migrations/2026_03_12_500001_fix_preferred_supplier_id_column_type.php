<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fixes C-5: `preferred_supplier_id` on inventory_items was created as a
 * varchar string by the 2026_03_12_500000 migration, but it is used as an
 * integer FK to suppliers.id.  In MySQL strict mode a string "5" ≠ integer 5,
 * so the relationship always returns null.  This migration drops the string
 * column and re-creates it as an unsigned big integer FK.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory_items', function (Blueprint $table): void {
            if (Schema::hasColumn('inventory_items', 'preferred_supplier_id')) {
                // Drop the FK constraint first (MySQL won't allow dropping the column otherwise)
                try {
                    $table->dropForeign(['preferred_supplier_id']);
                } catch (\Throwable) {
                    // No FK existed on this column (it was a plain varchar) — safe to continue
                }
                $table->dropColumn('preferred_supplier_id');
            }
        });

        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->foreignId('preferred_supplier_id')
                ->nullable()
                ->after('last_purchase_price')
                ->constrained('suppliers')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('inventory_items', function (Blueprint $table): void {
            if (Schema::hasColumn('inventory_items', 'preferred_supplier_id')) {
                $table->dropConstrainedForeignId('preferred_supplier_id');
            }
        });

        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->string('preferred_supplier_id')->nullable()->after('last_purchase_price');
        });
    }
};
