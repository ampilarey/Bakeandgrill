<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Role;
use App\Models\ServiceIncident;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage 6 — POST /api/service-status/notify-me + admin notify endpoint
 * (plan §14). Verifies no-enumeration success path, dedupe within an
 * incident, key allowlist, and the admin notify permission gate.
 */
class RestorationSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, ServiceStateSeeder::class]);
        Cache::flush();
    }

    public function test_signup_returns_generic_success_for_new_number(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
        ]);

        $response = $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'online_checkout',
            'mobile' => '7777777',
        ]);

        $response->assertOk();
        $response->assertJson(['ok' => true]);
        $this->assertDatabaseCount('restoration_subscriptions', 1);
        $this->assertDatabaseHas('restoration_subscriptions', [
            'service_key' => 'online_checkout',
            'normalized_mobile' => '+9607777777',
            'status' => 'pending',
        ]);
    }

    public function test_duplicate_signup_returns_same_response_and_does_not_create_second_row(): void
    {
        app(ServiceAvailabilityService::class)->setState('online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
        ]);

        $payload = ['service_key' => 'online_checkout', 'mobile' => '7777777'];

        $first = $this->postJson('/api/service-status/notify-me', $payload);
        $second = $this->postJson('/api/service-status/notify-me', $payload);

        $first->assertOk();
        $second->assertOk();
        $this->assertSame(
            $first->json('message'),
            $second->json('message'),
            'duplicate signup must return an identical message to prevent enumeration',
        );
        $this->assertDatabaseCount('restoration_subscriptions', 1);
    }

    public function test_signup_rejects_internal_service_keys(): void
    {
        $response = $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'pos_sales',
            'mobile' => '7777777',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['service_key']);
    }

    public function test_signup_rejects_bad_mobile(): void
    {
        $response = $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'online_checkout',
            'mobile' => '123',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['mobile']);
    }

    public function test_signup_snaps_to_open_incident(): void
    {
        $svc = app(ServiceAvailabilityService::class);
        $svc->setState('online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
        ]);
        $incidentId = ServiceIncident::query()->where('service_key', 'online_checkout')->firstOrFail()->id;

        $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'online_checkout',
            'mobile' => '7777777',
        ])->assertOk();

        $this->assertDatabaseHas('restoration_subscriptions', [
            'service_incident_id' => $incidentId,
            'normalized_mobile' => '+9607777777',
        ]);
    }

    public function test_admin_notify_endpoint_requires_permission(): void
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Staff',
            'email' => 'staff@notify.test',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        $response = $this->postJson('/api/admin/service-availability/online_checkout/notify');
        $response->assertStatus(403);
    }

    public function test_admin_notify_dispatches_jobs_for_pending_subscriptions(): void
    {
        \Illuminate\Support\Facades\Queue::fake();

        $svc = app(ServiceAvailabilityService::class);
        $svc->setState('online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
        ]);
        $incidentId = ServiceIncident::query()->where('service_key', 'online_checkout')->firstOrFail()->id;

        $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'online_checkout',
            'mobile' => '7777777',
        ])->assertOk();
        $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'online_checkout',
            'mobile' => '7777778',
        ])->assertOk();

        // Close the incident via restore.
        $owner = $this->makeOwnerForNotify();
        $svc->setState('online_checkout', ['status' => 'available'], actor: $owner);

        $this->postJson('/api/admin/service-availability/online_checkout/notify')
            ->assertOk()
            ->assertJson(['dispatched' => 2]);

        \Illuminate\Support\Facades\Queue::assertPushed(\App\Jobs\SendRestorationSmsJob::class, 2);
    }

    private function makeOwnerForNotify(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Owner',
            'email' => 'owner@notify.test',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }
}
