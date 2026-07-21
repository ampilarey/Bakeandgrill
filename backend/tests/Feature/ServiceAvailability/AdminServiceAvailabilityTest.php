<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage 4 — admin service availability controls + permissions.
 */
class AdminServiceAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, ServiceStateSeeder::class]);
        Cache::flush();
    }

    private function actAsOwner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Admin Owner',
            'email' => 'owner@admin-svc-avail.com',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    private function actAsPlainStaff(): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Plain Staff',
            'email' => 'staff@admin-svc-avail.com',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_unauthenticated_index_returns_401(): void
    {
        $this->getJson('/api/admin/service-availability')->assertStatus(401);
    }

    public function test_plain_staff_cannot_view_or_patch(): void
    {
        $this->actAsPlainStaff();
        $this->getJson('/api/admin/service-availability')->assertStatus(403);
        $this->patchJson('/api/admin/service-availability/online_checkout', [
            'status' => 'unavailable',
        ])->assertStatus(403);
    }

    public function test_owner_can_list_all_service_states(): void
    {
        $this->actAsOwner();
        $response = $this->getJson('/api/admin/service-availability');
        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [['service_key', 'group', 'status', 'resolved_available']],
        ]);
        $this->assertGreaterThanOrEqual(12, count($response->json('data')));
    }

    public function test_owner_can_patch_online_checkout_and_writes_audit(): void
    {
        $owner = $this->actAsOwner();

        $response = $this->patchJson('/api/admin/service-availability/online_checkout', [
            'status' => 'unavailable',
            'reason_type' => 'technical_maintenance',
            'public_message' => 'Under maintenance',
            'alternatives' => ['pickup', 'call'],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'unavailable');
        $response->assertJsonPath('data.public_message', 'Under maintenance');

        $this->assertDatabaseHas('service_states', [
            'service_key' => 'online_checkout',
            'status' => 'unavailable',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'service_availability.state_changed',
            'user_id' => $owner->id,
        ]);
    }

    public function test_patch_rejects_unknown_status_and_key(): void
    {
        $this->actAsOwner();
        $this->patchJson('/api/admin/service-availability/online_checkout', [
            'status' => 'not_a_status',
        ])->assertStatus(422);

        $this->patchJson('/api/admin/service-availability/imaginary_key', [
            'status' => 'unavailable',
        ])->assertStatus(404);
    }

    public function test_patch_strips_html_from_messages(): void
    {
        $this->actAsOwner();
        $this->patchJson('/api/admin/service-availability/online_checkout', [
            'status' => 'unavailable',
            'public_message' => 'Down <script>alert(1)</script> for maintenance',
        ])->assertOk();

        $response = $this->getJson('/api/admin/service-availability');
        $entries = collect($response->json('data'))->firstWhere('service_key', 'online_checkout');
        $this->assertStringNotContainsString('<script>', $entries['public_message']);
        $this->assertStringContainsString('Down', $entries['public_message']);
    }

    public function test_preset_dry_run_returns_preview_and_does_not_write(): void
    {
        $this->actAsOwner();

        $response = $this->postJson('/api/admin/service-availability/preset/pause_all_online_ordering?dry_run=1');

        $response->assertOk();
        $response->assertJsonPath('dry_run', true);
        $response->assertJsonPath('preset', 'pause_all_online_ordering');
        $response->assertJsonStructure(['changes' => [['service_key', 'target_status']]]);

        // Confirm no writes happened.
        $this->assertSame('available', app(ServiceAvailabilityService::class)->state('online_checkout')['status']);
    }

    public function test_preset_applies_when_not_dry_run(): void
    {
        $this->actAsOwner();

        $this->postJson('/api/admin/service-availability/preset/pause_all_online_ordering')
            ->assertOk()
            ->assertJsonPath('applied', 4);

        $this->assertSame('operational_pause', app(ServiceAvailabilityService::class)->state('online_checkout')['status']);
    }

    public function test_high_impact_key_patch_requires_typed_confirmation(): void
    {
        $this->actAsOwner();
        // pos_sales going to unavailable requires confirmation
        $this->patchJson('/api/admin/service-availability/pos_sales', [
            'status' => 'unavailable',
        ])->assertStatus(422)
            ->assertJsonPath('errors.confirmation.0', 'Type EMERGENCY LOCKDOWN to confirm this high-impact change.');

        $this->patchJson('/api/admin/service-availability/pos_sales', [
            'status' => 'unavailable',
            'confirmation' => 'EMERGENCY LOCKDOWN',
        ])->assertOk();
    }

    public function test_history_returns_incidents_and_audits(): void
    {
        $this->actAsOwner();
        $this->patchJson('/api/admin/service-availability/online_checkout', [
            'status' => 'unavailable',
            'public_message' => 'Down',
        ])->assertOk();

        $response = $this->getJson('/api/admin/service-availability/online_checkout/history');
        $response->assertOk();
        $response->assertJsonPath('service_key', 'online_checkout');
        $this->assertGreaterThanOrEqual(1, count($response->json('incidents')));
        $this->assertGreaterThanOrEqual(1, count($response->json('audits')));
    }

    public function test_restore_flips_status_and_closes_incident(): void
    {
        $this->actAsOwner();
        $this->patchJson('/api/admin/service-availability/online_checkout', [
            'status' => 'unavailable',
        ])->assertOk();

        $this->postJson('/api/admin/service-availability/online_checkout/restore')
            ->assertOk()
            ->assertJsonPath('data.status', 'available');

        $this->assertDatabaseHas('service_states', [
            'service_key' => 'online_checkout',
            'status' => 'available',
            'current_incident_id' => null,
        ]);
    }
}
