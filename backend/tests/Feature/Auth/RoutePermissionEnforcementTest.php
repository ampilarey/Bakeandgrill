<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RoutePermissionEnforcementTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_without_time_clock_permission_is_blocked(): void
    {
        $role = Role::firstOrCreate(['slug' => 'basic'], ['name' => 'Basic', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'No Clock',
            'email' => 'no-clock@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/time-clock/status')->assertForbidden();
    }

    public function test_staff_with_time_clock_permission_can_view_status(): void
    {
        $user = $this->makeStaff('staff');

        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/time-clock/status')->assertOk();
    }

    public function test_manager_with_staff_view_can_read_time_clock_history_without_pos_time_clock(): void
    {
        $manager = $this->makeManager();
        $manager->revokePermission('pos.time_clock');

        Sanctum::actingAs($manager, ['staff']);

        $this->getJson('/api/time-clock/history')->assertOk();
    }

    public function test_staff_with_time_clock_but_without_staff_view_cannot_read_summary(): void
    {
        $user = $this->makeStaff('staff');

        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/time-clock/summary')->assertForbidden();
    }

    public function test_staff_with_staff_view_can_read_time_clock_summary(): void
    {
        $user = $this->makeStaff('staff');
        $user->grantPermission('staff.view');

        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/time-clock/summary')->assertOk();
    }

    public function test_manager_can_update_online_ordering_settings(): void
    {
        $manager = $this->makeManager();

        Sanctum::actingAs($manager, ['staff']);

        $this->postJson('/api/admin/ordering/toggle', ['enabled' => true])
            ->assertOk()
            ->assertJsonPath('online_ordering_enabled', true);
    }

    public function test_staff_without_settings_update_cannot_toggle_ordering(): void
    {
        $user = $this->makeStaff('staff');
        $user->revokePermission('settings.update');
        $user->revokePermission('settings.manage');

        Sanctum::actingAs($user, ['staff']);

        $this->postJson('/api/admin/ordering/toggle', ['enabled' => false])
            ->assertForbidden();
    }
}
