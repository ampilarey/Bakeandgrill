<?php

declare(strict_types=1);

namespace Tests\Feature\Reservations;

use App\Domains\Reservations\Services\ReservationService;
use App\Models\Customer;
use App\Models\Reservation;
use App\Models\ReservationSetting;
use App\Models\RestaurantTable;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Reservation audit, 2026-09-25: capacity follows how long a booking
 * lasts, two tables can be joined for a large party, and guests cannot
 * cancel online inside the cut-off.
 */
class ReservationCapacityAndCutoffTest extends TestCase
{
    use RefreshDatabase;

    private array $ownerHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ownerHeaders = $this->staffHeaders($this->makeOwner());
        ReservationSetting::updateOrCreate([], [
            'max_party_size' => 20, 'advance_booking_days' => 30, 'slot_duration_minutes' => 30,
            'buffer_minutes_between' => 0, 'opening_time' => '18:00', 'closing_time' => '22:00', 'cancel_cutoff_hours' => 2,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function book(array $over = []): Reservation
    {
        return Reservation::create(array_merge([
            'customer_name' => 'Guest', 'customer_phone' => '+9607770001', 'party_size' => 4,
            'date' => today()->addDays(2)->toDateString(), 'time_slot' => '19:00:00', 'duration_minutes' => 60,
            'status' => 'confirmed', 'tracking_token' => \Illuminate\Support\Str::random(32),
        ], $over));
    }

    public function test_a_booking_holds_its_seats_for_its_whole_duration(): void
    {
        RestaurantTable::create(['name' => 'T1', 'capacity' => 4, 'is_active' => true, 'status' => 'available']);
        $this->book(['duration_minutes' => 60]); // 19:00–20:00
        $date = today()->addDays(2)->toDateString();

        $slots = collect($this->getJson("/api/reservations/availability?date={$date}&party_size=2")->assertOk()->json('slots'));
        $by = fn (string $t) => $slots->firstWhere('time_slot', $t . ':00') ?? $slots->firstWhere('time_slot', $t);
        $this->assertSame(0, $by('19:00')['remaining_capacity']);
        $this->assertSame(0, $by('19:30')['remaining_capacity'], 'still at the table at half past');
        $this->assertSame(4, $by('20:00')['remaining_capacity'], 'free once the hour is up');
        $this->assertSame(4, $by('18:30')['remaining_capacity']);

        $this->postJson('/api/reservations', ['customer_name' => 'Late', 'customer_phone' => '+9607770002', 'party_size' => 2, 'date' => $date, 'time_slot' => '19:30'])->assertStatus(422);
        $this->postJson('/api/reservations', ['customer_name' => 'Fine', 'customer_phone' => '+9607770002', 'party_size' => 2, 'date' => $date, 'time_slot' => '20:00'])->assertCreated();
    }

    public function test_a_large_party_is_seated_across_two_free_tables(): void
    {
        ReservationSetting::current()->update(['slot_duration_minutes' => 60]);
        RestaurantTable::create(['name' => 'Two', 'capacity' => 2, 'is_active' => true, 'status' => 'available']);
        RestaurantTable::create(['name' => 'Four A', 'capacity' => 4, 'is_active' => true, 'status' => 'available']);
        RestaurantTable::create(['name' => 'Four B', 'capacity' => 4, 'is_active' => true, 'status' => 'available']);
        RestaurantTable::create(['name' => 'Six', 'capacity' => 6, 'is_active' => true, 'status' => 'available']);
        $date = today()->addDays(2)->toDateString();
        $tables = fn ($res) => array_merge([$res->json('reservation.table.name')], array_column($res->json('reservation.extra_tables') ?? [], 'name'));

        // Eight: no single table fits; the pair with the least spare seats is Two + Six (8 exactly).
        $eight = $this->postJson('/api/admin/reservations', ['customer_name' => 'Eight', 'customer_phone' => '7770003', 'party_size' => 8, 'date' => $date, 'time_slot' => '19:00'], $this->ownerHeaders)->assertCreated();
        $this->assertEqualsCanonicalizing(['Two', 'Six'], $tables($eight));
        $this->assertCount(2, Reservation::findOrFail((int) $eight->json('reservation.id'))->allTableIds());

        // Half an hour later they are still seated, so a six gets the two four-seaters joined.
        $six = $this->postJson('/api/admin/reservations', ['customer_name' => 'Six', 'customer_phone' => '7770004', 'party_size' => 6, 'date' => $date, 'time_slot' => '19:30'], $this->ownerHeaders)->assertCreated();
        $this->assertEqualsCanonicalizing(['Four A', 'Four B'], $tables($six));

        // Every table is held at 19:30: a couple is booked (capacity allows it) but with no table to name.
        $two = $this->postJson('/api/admin/reservations', ['customer_name' => 'Two more', 'customer_phone' => '7770005', 'party_size' => 2, 'date' => $date, 'time_slot' => '19:30'], $this->ownerHeaders)->assertCreated();
        $this->assertNull($two->json('reservation.table'));

        // At 20:00 the eight have left: a four takes Four A alone, no joining.
        $later = $this->postJson('/api/admin/reservations', ['customer_name' => 'Later', 'customer_phone' => '7770006', 'party_size' => 4, 'date' => $date, 'time_slot' => '20:00'], $this->ownerHeaders)->assertCreated();
        $this->assertSame(['Six'], $tables($later), 'the four-seaters are still held by the six until 20:30; the Six is free');
        $this->assertSame([], $later->json('reservation.extra_tables'));
    }

    public function test_guests_cannot_cancel_online_inside_the_cut_off_but_staff_can(): void
    {
        RestaurantTable::create(['name' => 'T1', 'capacity' => 10, 'is_active' => true, 'status' => 'available']);
        Carbon::setTestNow(Carbon::parse(today()->toDateString() . ' 18:00:00'));
        $customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607770009', 'is_active' => true]);
        $soon = $this->book(['customer_id' => $customer->id, 'customer_phone' => '+9607770009', 'date' => today()->toDateString(), 'time_slot' => '19:30:00']);
        $later = $this->book(['customer_id' => $customer->id, 'customer_phone' => '+9607770009', 'date' => today()->toDateString(), 'time_slot' => '21:00:00']);

        // Staff are not bound by the cut-off (they cancel through the status endpoint).
        $staffSoon = $this->book(['customer_id' => $customer->id, 'customer_phone' => '+9607770009', 'date' => today()->toDateString(), 'time_slot' => '19:00:00']);
        $this->patchJson("/api/admin/reservations/{$staffSoon->id}/status", ['status' => 'cancelled'], $this->ownerHeaders)->assertOk();
        $this->assertSame('cancelled', $staffSoon->fresh()->status);

        Sanctum::actingAs($customer, ['customer']);
        $this->deleteJson("/api/reservations/{$soon->id}")->assertStatus(422)
            ->assertJsonFragment(['message' => 'Online cancellation closes 2 hours before the booking. Please call us to cancel.']);
        $this->assertSame('confirmed', $soon->fresh()->status);
        $this->deleteJson("/api/reservations/{$later->id}")->assertOk();
        $this->assertSame('cancelled', $later->fresh()->status);

        // 0 switches the cut-off off.
        ReservationSetting::current()->update(['cancel_cutoff_hours' => 0]);
        $again = $this->book(['customer_id' => $customer->id, 'customer_phone' => '+9607770009', 'date' => today()->toDateString(), 'time_slot' => '18:30:00']);
        $this->deleteJson("/api/reservations/{$again->id}")->assertOk();

        $this->assertInstanceOf(ReservationService::class, app(ReservationService::class));
    }
}
