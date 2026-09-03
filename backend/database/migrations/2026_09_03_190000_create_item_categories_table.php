<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Also show in": the extra categories an item is listed under.
 *
 * Owner, 2026-09-03: "Bajiya is Hedhikaa → Kulhi Hedhikaa, but it's an
 * evening tea item, so can it be in that too?" The item keeps one home
 * (items.category_id) that owns its sort order, reports, kitchen station
 * and stock; these rows only add where else the menus list the same card.
 * Nothing about money or stock reads this table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_categories', function (Blueprint $table) {
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->primary(['item_id', 'category_id']);
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_categories');
    }
};
