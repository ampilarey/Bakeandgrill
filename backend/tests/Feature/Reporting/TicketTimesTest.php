<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Orders\Support\OrderTimeline;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-11-07: "Will the site record time for each ticket and can admin view that?" →
 * "Both": a timeline on every order and a Ticket times report, measured from the same stamps.
 */
class TicketTimesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->travelTo(CarbonImmutable::parse('2026-11-07 20:00:00'));
        $this->owner = $this->makeOwner();
        $this->actingAs($this->owner);
    }

    /** @param array<string, string|null> $stamps minutes after 12:00 */
    private function ticket(array $stamps, string $type = 'dine_in', ?int $userId = null, string $status = 'completed'): Order
    {
        $base = CarbonImmutable::parse('2026-11-07 12:00:00');
        $at = static fn (?int $m) => $m === null ? null : $base->addMinutes($m);
        $o = Order::factory()->create(['type' => $type, 'status' => $status, 'user_id' => $userId ?? $this->owner->id]);
        $o->forceFill([
            'created_at' => $base,
            'fired_at' => $at($stamps['fired'] ?? null),
            'kitchen_started_at' => $at($stamps['cooking'] ?? null),
            'kitchen_done_at' => $at($stamps['ready'] ?? null),
            'paid_at' => $at($stamps['paid'] ?? null),
            'completed_at' => $at($stamps['end'] ?? null),
        ])->saveQuietly();

        return $o->fresh();
    }

    public function test_an_order_shows_each_step_with_the_minutes_between(): void
    {
        $o = $this->ticket(['fired' => 2, 'cooking' => 4, 'ready' => 12, 'paid' => 20, 'end' => 21]);

        $t = OrderTimeline::for($o);
        $this->assertSame(['start', 'fired', 'cooking', 'ready', 'paid', 'completed'], array_column($t['steps'], 'key'));
        $this->assertSame(['Rung up', 'Sent to kitchen', 'Cooking started', 'Ready', 'Paid', 'Completed'], array_column($t['steps'], 'label'));
        $this->assertSame([null, 2.0, 2.0, 8.0, 8.0, 1.0], array_column($t['steps'], 'minutes_from_previous'));
        $this->assertSame(21.0, $t['total_minutes']);
        $this->assertFalse($t['open']);

        $shown = $this->getJson('/api/orders/' . $o->id)->assertOk();
        $this->assertSame('Ready', $shown->json('order.timeline.steps.3.label'));
        $this->assertSame(21, (int) $shown->json('order.timeline.total_minutes'));
    }

    public function test_an_online_order_is_placed_and_paid_before_the_kitchen(): void
    {
        $o = Order::factory()->onlinePickup()->create(['status' => 'in_progress', 'user_id' => null]);
        $base = CarbonImmutable::parse('2026-11-07 12:00:00');
        $o->forceFill(['created_at' => $base, 'paid_at' => $base->addMinute(), 'fired_at' => $base->addMinutes(2)])->saveQuietly();

        $t = OrderTimeline::for($o->fresh());
        $this->assertSame(['Placed online', 'Paid', 'Sent to kitchen'], array_column($t['steps'], 'label'));
        $this->assertTrue($t['open']);
        $this->assertNull($t['total_minutes']);
    }

    public function test_every_path_to_completed_records_when(): void
    {
        $o = Order::factory()->create(['status' => 'ready', 'type' => 'takeaway']);
        $o->update(['status' => 'completed']);

        $this->assertNotNull($o->fresh()->completed_at);
    }

    public function test_the_report_measures_each_stage_and_leaves_out_stale_tickets(): void
    {
        $cashier = User::factory()->create(['name' => 'Mariyam']);
        $this->ticket(['fired' => 2, 'cooking' => 3, 'ready' => 13, 'paid' => 20, 'end' => 22]);
        $this->ticket(['fired' => 4, 'cooking' => 5, 'ready' => 25, 'paid' => 30, 'end' => 40], 'takeaway', $cashier->id);
        // Forgotten on the kitchen screen until the next morning: left out, counted.
        $this->ticket(['fired' => 1, 'cooking' => 1, 'ready' => 900], 'dine_in');
        $this->ticket(['fired' => 1], 'dine_in', null, 'cancelled');

        $r = $this->getJson('/api/reports/ticket-times?from=2026-11-07&to=2026-11-07')->assertOk();

        $this->assertSame(3, $r->json('tickets'));
        $this->assertEqualsWithDelta(15.0, $r->json('stages.cooking.avg'), 0.01); // (10 + 20) / 2
        $this->assertSame(2, $r->json('stages.cooking.count'));
        $this->assertSame(1, $r->json('left_out.cooking'));
        $this->assertEqualsWithDelta(25.0, $r->json('stages.to_pay.avg'), 0.01); // (20 + 30) / 2
        $this->assertEqualsWithDelta(31.0, $r->json('stages.total.avg'), 0.01);
        $this->assertEqualsWithDelta(40.0, $r->json('stages.total.max'), 0.01);
        $this->assertSame('12', $r->json('by_hour.0.key'));
        $this->assertSame('Mariyam', collect($r->json('by_staff'))->firstWhere('name', 'Mariyam')['name']);
        $this->assertSame(40, (int) $r->json('slowest.0.total'));

        $only = $this->getJson('/api/reports/ticket-times?from=2026-11-07&to=2026-11-07&type=takeaway')->assertOk();
        $this->assertSame(1, $only->json('tickets'));
    }

    public function test_the_report_needs_reports_view(): void
    {
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/reports/ticket-times')->assertForbidden();
    }
}
