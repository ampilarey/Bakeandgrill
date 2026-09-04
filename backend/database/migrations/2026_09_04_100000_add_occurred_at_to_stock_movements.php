<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Backdating, 2026-09-04.
 *
 * A purchase already carries its own `purchase_date`, so a delivery from last
 * week can be entered under last week. The stock ledger had no such field: a
 * movement only knew `created_at`, the moment somebody pressed the button. So a
 * backdated receipt landed in the ledger as "received today", and every report
 * that reads the ledger by date — Usage Variance above all — put the stock in
 * the wrong month.
 *
 * `occurred_at` is when the thing happened in the real world. `created_at`
 * stays what it always was: when we wrote it down. For everything entered as it
 * happens the two are the same, which is why the backfill is simply a copy.
 *
 * Nullable rather than NOT NULL DEFAULT: null means "nobody told us", and the
 * readers coalesce to `created_at`, so a row written by code that predates this
 * column still reports correctly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table): void {
            if (!Schema::hasColumn('stock_movements', 'occurred_at')) {
                $table->timestamp('occurred_at')->nullable()->after('notes');
                $table->index('occurred_at');
            }
        });

        // Every existing row was recorded as it happened, so the two agree.
        // Chunked: this table is the largest in the schema on a live site.
        DB::table('stock_movements')
            ->whereNull('occurred_at')
            ->orderBy('id')
            ->chunkById(2000, function ($rows): void {
                foreach ($rows as $row) {
                    DB::table('stock_movements')
                        ->where('id', $row->id)
                        ->update(['occurred_at' => $row->created_at]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table): void {
            if (Schema::hasColumn('stock_movements', 'occurred_at')) {
                $table->dropIndex(['occurred_at']);
                $table->dropColumn('occurred_at');
            }
        });
    }
};
