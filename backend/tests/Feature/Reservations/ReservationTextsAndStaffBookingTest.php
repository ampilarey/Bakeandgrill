<?php

declare(strict_types=1);

namespace Tests\Feature\Reservations;

use App\Domains\Reservations\Listeners\SendReservationCancelledListener;
use App\Domains\Reservations\Listeners\SendReservationConfirmationListener;
use App\Domains\Reservations\Listeners\SendReservationConfirmedListener;
use App\Domains\Reservations\Services\ReservationService;
use App\Models\Customer;
use App\Models\Reservation;
use App\Models\ReservationSetting;
use App\Models\RestaurantTable;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Ops audit, 2026-09-25: a reminder the day before, a text when a booking
 * is cancelled, and staff able to take a booking by phone.
 */
class ReservationTextsAndStaffBookingTest extends TestCase
{
    use RefreshDatabase;

    private array $ownerHeaders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ownerHeaders = $this->staffHeaders($this->makeOwner());
        ReservationSetting::updateOrCreate([], [
            'max_party_size' => 20, 'advance_booking_days' => 30, 'slot_duration_minutes' => 30,
            'buffer_minutes_between' => 0, 'opening_time' => '08:00', 'closing_time' => '22:00',
        ]);
        RestaurantTable::create(['name' => 'Hall A', 'capacity' => 40, 'is_active' => true, 'status' => 'available']);
    }

    public function test_staff_take_a_booking_by_phone_confirmed_on_the_spot_and_linked_to_the_customer(): void
    {
        Event::fake([\App\Domains\Reservations\Events\ReservationCreated::class, \App\Domains\Reservations\Events\ReservationConfirmed::class]);
        $aisha = Customer::create(['name' => 'Aisha', 'phone' => '+9607771234', 'is_active' => true]);

        $res = $this->postJson('/api/admin/reservations', [
            'customer_name' => 'Aisha', 'customer_phone' => '7771234', 'party_size' => 4,
            'date' => today()->addDays(3)->toDateString(), 'time_slot' => '19:00', 'notes' => 'Window seat',
        ], $this->ownerHeaders)->assertCreated()
            ->assertJsonPath('reservation.status', 'confirmed')
            ->assertJsonPath('reservation.table.name', 'Hall A');
        $booking = Reservation::findOrFail((int) $res->json('reservation.id'));
        $this->assertSame($aisha->id, $booking->customer_id, 'linked by phone');
        $this->assertSame('+9607771234', $booking->customer_phone);

        Event::assertDispatched(\App\Domains\Reservations\Events\ReservationConfirmed::class);
        Event::assertNotDispatched(\App\Domains\Reservations\Events\ReservationCreated::class, 'no "we will confirm shortly" text for a booking confirmed on the spot');

        // Staff bookings are not gated by the public form's rules but still by capacity.
        $this->postJson('/api/admin/reservations', [
            'customer_name' => 'Big group', 'customer_phone' => '7770000', 'party_size' => 40,
            'date' => today()->addDays(3)->toDateString(), 'time_slot' => '19:00',
        ], $this->ownerHeaders)->assertStatus(422);
        $this->postJson('/api/admin/reservations', ['customer_name' => 'x', 'customer_phone' => '12', 'party_size' => 2, 'date' => today()->toDateString(), 'time_slot' => '19:00'], $this->ownerHeaders)->assertStatus(422);
    }

    public function test_the_guest_hears_when_a_booking_is_cancelled_by_staff_or_by_themselves(): void
    {
        $service = app(ReservationService::class);
        $make = fn (string $phone) => Reservation::create([
            'customer_name' => 'Guest', 'customer_phone' => $phone, 'party_size' => 2, 'date' => today()->addDays(2)->toDateString(),
            'time_slot' => '12:00:00', 'duration_minutes' => 30, 'status' => 'confirmed', 'tracking_token' => \Illuminate\Support\Str::random(32),
        ]);

        $byStaff = $make('+9607770001');
        $this->patchJson("/api/admin/reservations/{$byStaff->id}/status", ['status' => 'cancelled'], $this->ownerHeaders)->assertOk();
        app(SendReservationCancelledListener::class)->handle(new \App\Domains\Reservations\Events\ReservationCancelled($byStaff->fresh(), 'staff'));
        app(SendReservationCancelledListener::class)->handle(new \App\Domains\Reservations\Events\ReservationCancelled($byStaff->fresh(), 'staff'));
        $logs = SmsLog::where('idempotency_key', "reservation:cancelled:{$byStaff->id}")->get();
        $this->assertCount(1, $logs, 'once, however many times the event fires');
        $this->assertSame('reservation_cancelled', $logs->first()->type);
        $this->assertStringContainsString('Sorry, your reservation for 2', (string) $logs->first()->message);
        $this->assertStringContainsString('call us to rebook', (string) $logs->first()->message);

        $customer = Customer::create(['name' => 'Self', 'phone' => '+9607770002', 'is_active' => true]);
        $bySelf = $make('+9607770002');
        $bySelf->update(['customer_id' => $customer->id]);
        Event::fake([\App\Domains\Reservations\Events\ReservationCancelled::class]);
        $service->cancel($bySelf->id, $customer->id, false);
        Event::assertDispatched(\App\Domains\Reservations\Events\ReservationCancelled::class, fn ($e) => $e->by === 'customer' && $e->reservation->id === $bySelf->id);
        // And the wording for a guest who cancelled themselves.
        app(SendReservationCancelledListener::class)->handle(new \App\Domains\Reservations\Events\ReservationCancelled($bySelf->fresh(), 'customer'));
        $this->assertStringContainsString('cancelled as requested', (string) SmsLog::where('idempotency_key', "reservation:cancelled:{$bySelf->id}")->firstOrFail()->message);

        // Cancelling an already cancelled booking does not fire again.
        Event::fake([\App\Domains\Reservations\Events\ReservationCancelled::class]);
        $service->cancel($bySelf->id, $customer->id, false);
        Event::assertNotDispatched(\App\Domains\Reservations\Events\ReservationCancelled::class);
    }

    public function test_tomorrows_bookings_get_a_reminder_once_and_todays_new_ones_do_not(): void
    {
        $tomorrow = today()->addDay()->toDateString();
        $old = Reservation::create(['customer_name' => 'Old', 'customer_phone' => '+9607770011', 'party_size' => 3, 'date' => $tomorrow, 'time_slot' => '18:00:00', 'duration_minutes' => 30, 'status' => 'confirmed', 'tracking_token' => str_repeat('b', 32)]);
        $old->forceFill(['created_at' => now()->subDays(3)])->save();
        $pending = Reservation::create(['customer_name' => 'Pending', 'customer_phone' => '+9607770012', 'party_size' => 2, 'date' => $tomorrow, 'time_slot' => '19:00:00', 'duration_minutes' => 30, 'status' => 'pending', 'tracking_token' => str_repeat('c', 32)]);
        $pending->forceFill(['created_at' => now()->subDay()])->save();
        $cancelled = Reservation::create(['customer_name' => 'Gone', 'customer_phone' => '+9607770013', 'party_size' => 2, 'date' => $tomorrow, 'time_slot' => '19:00:00', 'duration_minutes' => 30, 'status' => 'cancelled', 'tracking_token' => str_repeat('d', 32)]);
        $cancelled->forceFill(['created_at' => now()->subDay()])->save();
        Reservation::create(['customer_name' => 'Fresh', 'customer_phone' => '+9607770014', 'party_size' => 2, 'date' => $tomorrow, 'time_slot' => '20:00:00', 'duration_minutes' => 30, 'status' => 'confirmed', 'tracking_token' => str_repeat('e', 32)]);
        Reservation::create(['customer_name' => 'Next week', 'customer_phone' => '+9607770015', 'party_size' => 2, 'date' => today()->addDays(6)->toDateString(), 'time_slot' => '20:00:00', 'duration_minutes' => 30, 'status' => 'confirmed', 'tracking_token' => str_repeat('f', 32)]);

        $this->artisan('reservations:send-reminders')->assertSuccessful();
        $this->artisan('reservations:send-reminders')->assertSuccessful();

        $sent = SmsLog::where('type', 'reservation_reminder')->get();
        $this->assertEqualsCanonicalizing(['+9607770011', '+9607770012'], $sent->pluck('to')->all());
        $this->assertStringContainsString('table for 3 is tomorrow', (string) $sent->firstWhere('to', '+9607770011')->message);
        $this->assertStringContainsString('at 18:00', (string) $sent->firstWhere('to', '+9607770011')->message);
    }

    public function test_existing_texts_still_go_out_for_the_public_form(): void
    {
        $id = (int) $this->postJson('/api/reservations', [
            'customer_name' => 'Web guest', 'customer_phone' => '+9607779999', 'party_size' => 2,
            'date' => today()->addDays(2)->toDateString(), 'time_slot' => '12:00',
        ])->assertCreated()->json('reservation.id');
        $reservation = Reservation::findOrFail($id);
        $this->assertSame('pending', $reservation->status);
        app(SendReservationConfirmationListener::class)->handle(new \App\Domains\Reservations\Events\ReservationCreated($reservation));
        $this->assertSame(1, SmsLog::where('type', 'reservation_received')->count());
        app(SendReservationConfirmedListener::class)->handle(new \App\Domains\Reservations\Events\ReservationConfirmed($reservation));
        $this->assertSame(1, SmsLog::where('type', 'reservation_confirmed')->count());
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }
}
