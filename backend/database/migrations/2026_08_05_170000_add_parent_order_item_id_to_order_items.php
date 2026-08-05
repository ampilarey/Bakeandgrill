<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 4c — platter child order lines.
 *
 * Each chosen platter component is its own order_items row pointing at the
 * parent platter line via parent_order_item_id. Selections are never stored
 * in JSON or notes (KDS never renders notes for composition).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->foreignId('parent_order_item_id')
                ->nullable()
                ->after('order_id')
                ->constrained('order_items')
                ->nullOnDelete();
            $table->index('parent_order_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('parent_order_item_id');
        });
    }
};
