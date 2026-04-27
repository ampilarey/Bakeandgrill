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
    /**
     * PostgreSQL aborts the whole migration transaction on a failed ALTER;
     * we may attempt dropForeign when the constraint name does not match.
     */
    public $withinTransaction = false;

    public function up(): void
    {
        if (!Schema::hasColumn('inventory_items', 'preferred_supplier_id')) {
            return;
        }

        // Drop FK only if it actually exists — portable check via Schema builder.
        // Blueprint commands run after the closure returns, so try/catch must wrap
        // the whole Schema::table() call, not dropForeign() inside the closure.
        $hasFk = collect(Schema::getForeignKeys('inventory_items'))
            ->contains(fn (array $fk) => in_array('preferred_supplier_id', $fk['columns'], true));

        if ($hasFk) {
            try {
                Schema::table('inventory_items', function (Blueprint $table): void {
                    $table->dropForeign(['preferred_supplier_id']);
                });
            } catch (Throwable) {
                // Name mismatch vs getForeignKeys() on some drivers — safe to continue
            }
        }

        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->unsignedBigInteger('preferred_supplier_id')
                ->nullable()
                ->change();

            if (Schema::hasTable('suppliers')) {
                $table->foreign('preferred_supplier_id')
                    ->references('id')
                    ->on('suppliers')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('inventory_items', 'preferred_supplier_id')) {
            return;
        }

        try {
            Schema::table('inventory_items', function (Blueprint $table): void {
                $table->dropForeign(['preferred_supplier_id']);
            });
        } catch (Throwable) {
        }

        Schema::table('inventory_items', function (Blueprint $table): void {
            $table->string('preferred_supplier_id')->nullable()->change();
        });
    }
};
