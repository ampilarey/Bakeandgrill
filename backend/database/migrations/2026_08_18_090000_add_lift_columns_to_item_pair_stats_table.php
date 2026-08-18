<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Raw co-occurrence ranks the bestseller first for every anchor: if a drink is
 * in 40% of orders it is "frequently bought together" with everything, so the
 * panel shows the same three items forever. Lift divides that baseline
 * popularity out and surfaces the pairings that are actually surprising.
 *
 *   confidence(A→B) = pair_count / orders_containing(A)
 *   lift            = confidence / support(B)
 *                   = (pair_count × total_orders) / (anchor_orders × paired_orders)
 *
 * The inputs are stored alongside the score so the admin report can show its
 * working, and so a ranking change does not need a schema change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_pair_stats', function (Blueprint $table): void {
            // Orders containing item_id / paired_item_id in the same window.
            $table->unsignedInteger('anchor_orders')->default(0)->after('pair_count');
            $table->unsignedInteger('paired_orders')->default(0)->after('anchor_orders');
            // Window size (N). Identical on every row, but it keeps each row a
            // self-contained explanation of its own score.
            $table->unsignedInteger('total_orders')->default(0)->after('paired_orders');

            // Money the two items themselves took in orders holding both — the
            // line totals, not the whole basket, so "worth building a combo
            // around" is answered honestly.
            $table->decimal('pair_revenue', 12, 2)->default(0)->after('total_orders');

            $table->decimal('confidence', 6, 4)->default(0)->after('pair_revenue');
            $table->decimal('lift', 10, 4)->default(0)->after('confidence');
        });

        Schema::table('item_pair_stats', function (Blueprint $table): void {
            // The ranking path for both the cart panel and the admin report.
            $table->index(['item_id', 'lift'], 'item_pair_stats_item_lift_idx');
        });
    }

    public function down(): void
    {
        Schema::table('item_pair_stats', function (Blueprint $table): void {
            $table->dropIndex('item_pair_stats_item_lift_idx');
            $table->dropColumn([
                'anchor_orders',
                'paired_orders',
                'total_orders',
                'pair_revenue',
                'confidence',
                'lift',
            ]);
        });
    }
};
