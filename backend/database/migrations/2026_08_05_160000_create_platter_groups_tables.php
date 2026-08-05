<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 4a — platter choice groups on combo items.
 *
 * A platter is an is_combo item whose contents are chosen (platter_groups),
 * not fixed (combo_items). Tiered sizes use the existing variants table;
 * size_counts maps variant_id → how many pieces that size must pick.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platter_groups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->string('name', 120);
            /** exactly | min | range */
            $table->string('rule_type', 20)->default('exactly');
            $table->unsignedSmallInteger('min_count')->nullable();
            $table->unsignedSmallInteger('max_count')->nullable();
            /** variant_id (string key) → count, e.g. {"12":6,"13":9} */
            $table->json('size_counts')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('item_id');
        });

        Schema::create('platter_group_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('platter_group_id')->constrained('platter_groups')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->decimal('surcharge', 10, 2)->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['platter_group_id', 'item_id']);
            $table->index('platter_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platter_group_items');
        Schema::dropIfExists('platter_groups');
    }
};
