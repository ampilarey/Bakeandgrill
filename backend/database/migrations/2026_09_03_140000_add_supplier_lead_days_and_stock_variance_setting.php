<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stock audit, 2026-09-03.
 *
 * S6 — a supplier had no lead time of its own. `inventory_items.lead_days` gave
 *      one item one lead time no matter who supplied it, which is not how a
 *      shopping list works: the same rice is two days from one shop and a week
 *      from another.
 * S2/S5 — the house threshold above which a stock write-down has to say why.
 * S9 — `stock_movements.unit_cost` was NOT NULL, so two things broke on it:
 *      `POST /inventory/{id}/adjust` without a unit cost threw a 500 (the
 *      controller passes null), and a receipt with no price recorded had no way
 *      to say "we do not know" as opposed to "this was free". Nullable now.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table): void {
            if (!Schema::hasColumn('suppliers', 'lead_days')) {
                $table->unsignedSmallInteger('lead_days')->nullable()->after('payment_terms');
            }
        });

        Schema::table('stock_movements', function (Blueprint $table): void {
            $table->decimal('unit_cost', 12, 4)->nullable()->change();
        });

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'stock_variance_reason_mvr'],
            [
                'value' => '500',
                'type' => 'text',
                'group' => 'Inventory',
                'label' => 'Stock variance needing a reason (MVR)',
                'description' => 'A stock count line or manual adjustment worth this much or more must say why. 0 asks every time.',
                'is_public' => false,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        // The column is left nullable: rows written since may hold null, and a
        // NOT NULL change would fail on them.
        Schema::table('suppliers', function (Blueprint $table): void {
            if (Schema::hasColumn('suppliers', 'lead_days')) {
                $table->dropColumn('lead_days');
            }
        });

        DB::table('site_settings')->where('key', 'stock_variance_reason_mvr')->delete();
    }
};
