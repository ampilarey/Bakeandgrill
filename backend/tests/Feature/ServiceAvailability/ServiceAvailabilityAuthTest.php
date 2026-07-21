<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

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
 * Stage 3 auth check: audited legacy toggles require staff auth +
 * settings.update permission, and every admin write leaves an audit row.
 *
 * The plan §14 also lists this test class for Stage 4 (admin endpoints);
 * Stage 4 tests extend it — this file locks in the legacy toggle guard.
 */
class ServiceAvailabilityAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, ServiceStateSeeder::class]);
        Cache::flush();
    }

    public function test_unauthorized_cannot_flip_online_ordering(): void
    {
        $this->postJson('/api/admin/ordering/toggle', ['enabled' => false])
            ->assertStatus(401);
    }

    public function test_staff_without_permission_cannot_flip_online_ordering(): void
    {
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $staff = User::create([
            'name' => 'Plain Staff',
            'email' => 'plain@svc-avail-auth.com',
            'password' => Hash::make('secret'),
            'role_id' => $staffRole->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($staff, ['staff']);

        $this->postJson('/api/admin/ordering/toggle', ['enabled' => false])
            ->assertStatus(403);
    }

    public function test_owner_flip_creates_audit_log_entry(): void
    {
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@svc-avail-auth.com',
            'password' => Hash::make('secret'),
            'role_id' => $ownerRole->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->postJson('/api/admin/ordering/toggle', ['enabled' => false])->assertOk();
        $this->postJson('/api/admin/ordering/delivery-toggle', ['enabled' => false])->assertOk();
        $this->postJson('/api/admin/ordering/catering-toggle', ['enabled' => false])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ordering_gate.online_ordering_enabled.updated',
            'user_id' => $owner->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ordering_gate.delivery_accepting_orders.updated',
            'user_id' => $owner->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ordering_gate.catering_ordering_enabled.updated',
            'user_id' => $owner->id,
        ]);
    }
}
