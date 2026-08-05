<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Trigger vs reward roles on promotion_targets.
 *
 * null/absent role = reward by construction — no backfill. Existing rows keep
 * today's meaning (what gets discounted) without rewriting any data.
 *
 * Per-trigger minimum quantity lives in metadata JSON (e.g. {"min_qty": 2}),
 * matching the promotions.metadata pattern rather than a dedicated column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotion_targets', function (Blueprint $table): void {
            if (!Schema::hasColumn('promotion_targets', 'role')) {
                $table->string('role', 16)->nullable()->after('is_exclusion');
            }
            if (!Schema::hasColumn('promotion_targets', 'metadata')) {
                $table->json('metadata')->nullable()->after('role');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotion_targets', function (Blueprint $table): void {
            if (Schema::hasColumn('promotion_targets', 'metadata')) {
                $table->dropColumn('metadata');
            }
            if (Schema::hasColumn('promotion_targets', 'role')) {
                $table->dropColumn('role');
            }
        });
    }
};
