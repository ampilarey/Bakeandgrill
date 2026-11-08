<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-11-08: "today, yesterday, … all", on every row of date presets. All runs from the
 * first day on record to today, and a range check measures from that day.
 */
class AllDatesPresetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->travelTo(CarbonImmutable::parse('2026-11-08 12:00:00'));
        $this->actingAs($this->makeOwner());
    }

    public function test_the_reports_say_their_first_day_and_all_is_never_refused_as_too_long(): void
    {
        $o = Order::factory()->create(['status' => 'completed']);
        $o->forceFill(['created_at' => CarbonImmutable::parse('2025-03-02 10:00:00')])->saveQuietly();

        $this->getJson('/api/reports/first-day')->assertOk()->assertJsonPath('first_day', '2025-03-02');
        // Longer than a year, from the first order on: everything there is, allowed.
        $this->getJson('/api/reports/items-sold?from=2025-03-02&to=2026-11-08')->assertOk()->assertJsonPath('first_day', '2025-03-02');
        $this->getJson('/api/reports/ticket-times?from=2020-01-01&to=2026-11-08')->assertOk();
        $this->getJson('/api/reports/sales-trend?from=2025-03-02&to=2026-11-08&group=month')->assertOk()->assertJsonPath('first_day', '2025-03-02');
        // A long range starting after the first order is still refused.
        $this->getJson('/api/reports/items-sold?from=2025-06-01&to=2026-11-08')->assertStatus(422);
    }

    public function test_repayments_say_their_first_day_and_take_all(): void
    {
        $this->getJson('/api/admin/customers/credit-repayments?from=2026-11-08&to=2026-11-08')->assertOk()->assertJsonPath('first_day', '2026-11-08');
    }

    public function test_the_first_day_needs_reports_view(): void
    {
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/reports/first-day')->assertForbidden();
    }
}
