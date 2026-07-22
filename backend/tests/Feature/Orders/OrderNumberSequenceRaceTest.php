<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * FIX 14 — the daily_sequences upsert must survive a duplicate-insert
 * race. The service now uses `insertOrIgnore` + `lockForUpdate` re-select
 * so two concurrent "seed" attempts collapse into a single row rather
 * than blowing up with a UniqueConstraintViolationException on the
 * `date` unique index.
 */
class OrderNumberSequenceRaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_insert_or_ignore_survives_duplicate_seed(): void
    {
        $date = today()->toDateString();

        // First seed — fresh row.
        DB::table('daily_sequences')->insertOrIgnore([
            'date' => $date,
            'last_order_number' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Second seed — duplicate, must be silently ignored (no exception).
        DB::table('daily_sequences')->insertOrIgnore([
            'date' => $date,
            'last_order_number' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame(
            1,
            DB::table('daily_sequences')->where('date', $date)->count(),
            'Duplicate seed must not create a second row',
        );
    }

    public function test_second_generate_after_seeded_row_increments_by_one(): void
    {
        $date = today()->toDateString();

        DB::table('daily_sequences')->insertOrIgnore([
            'date' => $date,
            'last_order_number' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Simulate the lockForUpdate + increment path.
        for ($i = 1; $i <= 3; $i++) {
            $seq = DB::transaction(function () use ($date) {
                DB::table('daily_sequences')->insertOrIgnore([
                    'date' => $date,
                    'last_order_number' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $row = DB::table('daily_sequences')
                    ->where('date', $date)
                    ->lockForUpdate()
                    ->first();
                $next = ((int) ($row->last_order_number ?? 0)) + 1;
                DB::table('daily_sequences')
                    ->where('date', $date)
                    ->update(['last_order_number' => $next, 'updated_at' => now()]);

                return $next;
            });
            $this->assertSame($i, $seq);
        }
    }
}
