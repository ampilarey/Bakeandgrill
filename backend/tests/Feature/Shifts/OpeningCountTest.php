<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Shift;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-03: "in shift opening also add the shift-closing type of
 * money counting." The float can be counted note by note; the server totals
 * the notes itself and keeps the breakdown, as it does at close.
 */
class OpeningCountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeStaff('staff', ['name' => 'Hassan']), ['staff']);
    }

    public function test_a_note_by_note_count_is_totalled_by_the_server_and_kept(): void
    {
        // 2 × 500, 3 × 100, 4 × 20, 5 × 2 = 1,390.00. The client's own total is ignored.
        $this->postJson('/api/shifts/open', [
            'opening_count_method' => 'denominations',
            'opening_denominations' => ['50000' => 2, '10000' => 3, '2000' => 4, '200' => 5, '500' => 0],
            'opening_cash' => 99999,
        ])->assertCreated()->assertJsonPath('shift.opening_count_method', 'denominations');

        $shift = Shift::firstOrFail();
        $this->assertSame(1390.0, (float) $shift->opening_cash);
        $this->assertSame(['50000' => 2, '10000' => 3, '2000' => 4, '200' => 5], $shift->opening_count_breakdown, 'zero rows are dropped');
    }

    public function test_an_empty_count_opens_with_nothing_in_the_drawer(): void
    {
        $this->postJson('/api/shifts/open', ['opening_count_method' => 'denominations', 'opening_denominations' => []])->assertCreated();
        $this->assertSame(0.0, (float) Shift::firstOrFail()->opening_cash);
    }

    public function test_a_plain_total_and_an_older_till_still_work(): void
    {
        $this->postJson('/api/shifts/open', ['opening_count_method' => 'plain_total', 'opening_cash' => 250])->assertCreated();
        $shift = Shift::firstOrFail();
        $this->assertSame(250.0, (float) $shift->opening_cash);
        $this->assertSame('plain_total', $shift->opening_count_method);
        $this->assertNull($shift->opening_count_breakdown);
    }

    public function test_bad_counts_are_refused(): void
    {
        $this->postJson('/api/shifts/open', ['opening_count_method' => 'denominations'])
            ->assertStatus(422)->assertJsonValidationErrors('opening_denominations');
        $this->postJson('/api/shifts/open', ['opening_count_method' => 'denominations', 'opening_denominations' => ['1234' => 1]])
            ->assertStatus(422)->assertJsonValidationErrors('opening_denominations');
        $this->postJson('/api/shifts/open', ['opening_count_method' => 'denominations', 'opening_denominations' => ['50000' => -1]])
            ->assertStatus(422);
        $this->postJson('/api/shifts/open', ['opening_count_method' => 'plain_total'])
            ->assertStatus(422)->assertJsonValidationErrors('opening_cash');
        $this->assertSame(0, Shift::count());
    }
}
