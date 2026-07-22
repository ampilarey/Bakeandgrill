<?php

declare(strict_types=1);

namespace Tests\Feature\Reservations;

use App\Domains\Reservations\Listeners\SendReservationConfirmationListener;
use App\Domains\Reservations\Listeners\SendReservationConfirmedListener;
use App\Models\Reservation;
use App\Models\ReservationSetting;
use App\Models\RestaurantTable;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ReservationAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    private array $ownerHeaders;

    private string $date;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerHeaders = $this->staffHeaders($this->makeOwner());
        $this->date = today()->addDays(3)->toDateString();

        ReservationSetting::updateOrCreate([], [
            'max_party_size' => 8,
            'advance_booking_days' => 30,
            'slot_duration_minutes' => 60,
            'buffer_minutes_between' => 0,
            'auto_cancel_minutes' => 15,
            'opening_time' => '10:00',
            'closing_time' => '22:00',
        ]);

        // Total capacity 4 for overbooking tests.
        RestaurantTable::create([
            'name' => 'T1',
            'capacity' => 4,
            'is_active' => true,
            'status' => 'available',
        ]);
    }

    private function payload(int $partySize = 2, string $slot = '12:00'): array
    {
        return [
            'customer_name' => 'Guest ' . $partySize,
            'customer_phone' => '+960777' . str_pad((string) $partySize, 4, '0', STR_PAD_LEFT),
            'party_size' => $partySize,
            'date' => $this->date,
            'time_slot' => $slot,
        ];
    }

    public function test_overbooking_rejected_at_capacity(): void
    {
        $this->postJson('/api/reservations', $this->payload(2))->assertCreated();
        $this->postJson('/api/reservations', $this->payload(2))->assertCreated();

        // Capacity 4 fully booked — overflow must 422.
        $this->postJson('/api/reservations', $this->payload(1))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['time_slot']);

        $avail = $this->getJson('/api/reservations/availability?date=' . $this->date . '&party_size=1')
            ->assertOk();
        $slot = collect($avail->json('slots'))->firstWhere('time_slot', '12:00');
        $this->assertNotNull($slot);
        $this->assertFalse($slot['available']);
        $this->assertSame(0, $slot['remaining_capacity']);
    }

    public function test_max_party_size_enforced_from_settings(): void
    {
        ReservationSetting::current()->update(['max_party_size' => 3]);

        $this->postJson('/api/reservations', $this->payload(4))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['party_size']);

        $this->getJson('/api/reservations/availability?date=' . $this->date . '&party_size=4')
            ->assertStatus(422);

        $this->getJson('/api/reservations/availability?date=' . $this->date . '&party_size=2')
            ->assertOk()
            ->assertJsonPath('meta.max_party_size', 3);

        $this->postJson('/api/reservations', $this->payload(3))->assertCreated();
    }

    public function test_settings_round_trip_all_seven_fields(): void
    {
        $this->patchJson('/api/admin/reservations/settings', [
            'slot_duration_minutes' => 45,
            'max_party_size' => 12,
            'advance_booking_days' => 14,
            'buffer_minutes_between' => 10,
            'auto_cancel_minutes' => 20,
            'opening_time' => '11:00',
            'closing_time' => '21:30',
        ], $this->ownerHeaders)
            ->assertOk()
            ->assertJsonPath('settings.slot_duration_minutes', 45)
            ->assertJsonPath('settings.max_party_size', 12)
            ->assertJsonPath('settings.advance_booking_days', 14)
            ->assertJsonPath('settings.buffer_minutes_between', 10)
            ->assertJsonPath('settings.auto_cancel_minutes', 20)
            ->assertJsonPath('settings.opening_time', '11:00')
            ->assertJsonPath('settings.closing_time', '21:30');

        $this->getJson('/api/admin/reservations/settings', $this->ownerHeaders)
            ->assertOk()
            ->assertJsonPath('settings.opening_time', '11:00')
            ->assertJsonPath('settings.closing_time', '21:30');
    }

    public function test_status_transitions_guarded(): void
    {
        $id = $this->postJson('/api/reservations', $this->payload(2))
            ->assertCreated()
            ->json('reservation.id');

        // pending → seated is invalid
        $this->patchJson("/api/admin/reservations/{$id}/status", ['status' => 'seated'], $this->ownerHeaders)
            ->assertStatus(422);

        // pending → confirmed → seated → completed
        $this->patchJson("/api/admin/reservations/{$id}/status", ['status' => 'confirmed'], $this->ownerHeaders)
            ->assertOk()
            ->assertJsonPath('reservation.status', 'confirmed');
        $this->patchJson("/api/admin/reservations/{$id}/status", ['status' => 'seated'], $this->ownerHeaders)
            ->assertOk()
            ->assertJsonPath('reservation.status', 'seated');
        $this->patchJson("/api/admin/reservations/{$id}/status", ['status' => 'completed'], $this->ownerHeaders)
            ->assertOk()
            ->assertJsonPath('reservation.status', 'completed');

        // completed is terminal
        $this->patchJson("/api/admin/reservations/{$id}/status", ['status' => 'cancelled'], $this->ownerHeaders)
            ->assertStatus(422);
    }

    public function test_created_and_confirmed_sms_wording_and_idempotency(): void
    {
        Queue::fake();

        $id = $this->postJson('/api/reservations', $this->payload(2))
            ->assertCreated()
            ->json('reservation.id');

        // Run created listener synchronously.
        $reservation = Reservation::findOrFail($id);
        app(SendReservationConfirmationListener::class)->handle(
            new \App\Domains\Reservations\Events\ReservationCreated($reservation),
        );
        app(SendReservationConfirmationListener::class)->handle(
            new \App\Domains\Reservations\Events\ReservationCreated($reservation),
        );

        $created = SmsLog::query()->where('idempotency_key', "reservation:confirm:{$id}")->get();
        $this->assertCount(1, $created);
        $this->assertStringContainsString('request received', (string) $created->first()->message);
        $this->assertStringNotContainsString('Reservation confirmed for', (string) $created->first()->message);

        $this->patchJson("/api/admin/reservations/{$id}/status", ['status' => 'confirmed'], $this->ownerHeaders)
            ->assertOk();

        $confirmed = Reservation::findOrFail($id);
        app(SendReservationConfirmedListener::class)->handle(
            new \App\Domains\Reservations\Events\ReservationConfirmed($confirmed),
        );
        app(SendReservationConfirmedListener::class)->handle(
            new \App\Domains\Reservations\Events\ReservationConfirmed($confirmed),
        );

        $confLogs = SmsLog::query()->where('idempotency_key', "reservation:confirmed:{$id}")->get();
        $this->assertCount(1, $confLogs);
        $this->assertStringContainsString('Reservation confirmed for', (string) $confLogs->first()->message);
    }
}
