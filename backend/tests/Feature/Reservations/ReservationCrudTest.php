<?php

declare(strict_types=1);

namespace Tests\Feature\Reservations;

use App\Models\Reservation;
use App\Models\ReservationSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Reservation CRUD and lifecycle tests.
 *
 * Covers: public create, admin list, status update, cancel, settings CRUD.
 * The reservation service validates availability — to keep tests simple we
 * create a ReservationSetting that allows all time slots.
 */
class ReservationCrudTest extends TestCase
{
    use RefreshDatabase;

    private array $ownerHeaders;

    private array $basePayload;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerHeaders = $this->staffHeaders($this->makeOwner());

        // Ensure the reservation system has open slots
        ReservationSetting::updateOrCreate(
            [],
            [
                'max_party_size' => 20,
                'advance_booking_days' => 30,
                'slot_duration_minutes' => 30,
                'opening_time' => '08:00',
                'closing_time' => '22:00',
            ],
        );

        $this->basePayload = [
            'customer_name' => 'Test Guest',
            'customer_phone' => '+9607771234',
            'party_size' => 2,
            'date' => today()->addDays(2)->toDateString(),
            'time_slot' => '12:00',
        ];
    }

    // ── Public: create reservation ────────────────────────────────────────────

    public function test_anyone_can_create_a_reservation(): void
    {
        $this->postJson('/api/reservations', $this->basePayload)
            ->assertStatus(201)
            ->assertJsonPath('reservation.customer_name', 'Test Guest')
            ->assertJsonPath('reservation.party_size', 2);
    }

    public function test_reservation_requires_customer_name(): void
    {
        $payload = $this->basePayload;
        unset($payload['customer_name']);

        $this->postJson('/api/reservations', $payload)->assertStatus(422);
    }

    public function test_reservation_requires_future_date(): void
    {
        $this->postJson('/api/reservations', array_merge($this->basePayload, [
            'date' => today()->subDay()->toDateString(),
        ]))->assertStatus(422);
    }

    public function test_reservation_requires_valid_time_format(): void
    {
        $this->postJson('/api/reservations', array_merge($this->basePayload, [
            'time_slot' => '9am',
        ]))->assertStatus(422);
    }

    public function test_reservation_tracking_token_is_generated(): void
    {
        $response = $this->postJson('/api/reservations', $this->basePayload)
            ->assertStatus(201);

        $token = $response->json('reservation.tracking_token');
        $this->assertNotNull($token);
        $this->assertNotEmpty($token);
    }

    // ── Admin: list reservations ──────────────────────────────────────────────

    public function test_admin_can_list_reservations(): void
    {
        $this->postJson('/api/reservations', $this->basePayload)->assertStatus(201);

        $this->getJson('/api/admin/reservations', $this->ownerHeaders)
            ->assertStatus(200)
            ->assertJsonStructure(['data']);
    }

    public function test_list_requires_auth(): void
    {
        $this->getJson('/api/admin/reservations')->assertStatus(401);
    }

    public function test_list_requires_reservations_manage_permission(): void
    {
        $staff = $this->makeStaff('staff');
        $this->getJson('/api/admin/reservations', $this->staffHeaders($staff))
            ->assertStatus(403);
    }

    // ── Admin: update status ──────────────────────────────────────────────────

    public function test_admin_can_confirm_a_reservation(): void
    {
        $response = $this->postJson('/api/reservations', $this->basePayload)
            ->assertStatus(201);
        $id = $response->json('reservation.id');

        $this->patchJson(
            "/api/admin/reservations/{$id}/status",
            ['status' => 'confirmed'],
            $this->ownerHeaders,
        )->assertStatus(200)
            ->assertJsonPath('reservation.status', 'confirmed');
    }

    public function test_admin_can_cancel_a_reservation(): void
    {
        $response = $this->postJson('/api/reservations', $this->basePayload)
            ->assertStatus(201);
        $id = $response->json('reservation.id');

        $this->patchJson(
            "/api/admin/reservations/{$id}/status",
            ['status' => 'cancelled'],
            $this->ownerHeaders,
        )->assertStatus(200)
            ->assertJsonPath('reservation.status', 'cancelled');
    }

    public function test_status_update_rejects_invalid_status(): void
    {
        $response = $this->postJson('/api/reservations', $this->basePayload)
            ->assertStatus(201);
        $id = $response->json('reservation.id');

        $this->patchJson(
            "/api/admin/reservations/{$id}/status",
            ['status' => 'banana'],
            $this->ownerHeaders,
        )->assertStatus(422);
    }

    // ── Customer: cancel own reservation ─────────────────────────────────────

    public function test_customer_can_cancel_own_reservation(): void
    {
        $customer = $this->makeCustomer();
        Sanctum::actingAs($customer, ['customer']);

        $response = $this->postJson('/api/reservations', $this->basePayload)
            ->assertStatus(201);
        $id = $response->json('reservation.id');

        $this->deleteJson("/api/reservations/{$id}")
            ->assertStatus(200);

        $this->assertDatabaseHas('reservations', ['id' => $id, 'status' => 'cancelled']);
    }

    public function test_customer_cannot_cancel_another_customers_reservation(): void
    {
        // Create reservation for customer A (unauthenticated, no customer_id linked)
        $response = $this->postJson('/api/reservations', $this->basePayload)->assertStatus(201);
        $id = $response->json('reservation.id');

        // Manually set customer_id for customer A
        $customerA = $this->makeCustomer(['phone' => '+9607100001']);
        Reservation::where('id', $id)->update(['customer_id' => $customerA->id]);

        // Try to cancel as customer B — different customer_id, ownership check should fail
        $customerB = $this->makeCustomer(['phone' => '+9607100002']);
        Sanctum::actingAs($customerB, ['customer']);

        $this->deleteJson("/api/reservations/{$id}")->assertStatus(403);
    }

    // ── Admin: settings ───────────────────────────────────────────────────────

    public function test_admin_can_read_reservation_settings(): void
    {
        $this->getJson('/api/admin/reservations/settings', $this->ownerHeaders)
            ->assertStatus(200)
            ->assertJsonStructure(['settings']);
    }

    public function test_admin_can_update_reservation_settings(): void
    {
        $this->patchJson('/api/admin/reservations/settings', [
            'max_party_size' => 8,
        ], $this->ownerHeaders)->assertStatus(200);

        $this->assertDatabaseHas('reservation_settings', ['max_party_size' => 8]);
    }
}
