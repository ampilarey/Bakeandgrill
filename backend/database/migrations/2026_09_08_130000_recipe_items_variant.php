<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-07: "water has 500ml bottles and 1.5L bottles. In menu
 * it's as one item with variants" — and each size is a different thing on
 * the shelf, bought on its own line, counted on its own.
 *
 * A recipe row can now belong to one size. A row with no size is what it
 * always was: shared by every size, scaled by the size's "Uses" factor. A
 * row for one size is taken exactly as written, only when that size sells.
 * Water's recipe becomes two rows: 500ml takes one 500ml bottle, 1.5L takes
 * one 1.5L bottle.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recipe_items', function (Blueprint $table): void {
            $table->foreignId('variant_id')->nullable()->after('inventory_item_id')
                ->constrained('variants')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('recipe_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('variant_id');
        });
    }
};
