<?php

declare(strict_types=1);

namespace Tests\Feature\Ops;

use App\Models\Role;
use App\Models\User;
use App\Services\Ops\CloneLiveToTestTrigger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CloneLiveToTestEndpointTest extends TestCase
{
    use RefreshDatabase;

    private function actingOwner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-clone@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        return $owner;
    }

    private function actingStaff(): User
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $user = User::create([
            'name' => 'Staff',
            'email' => 'staff-clone@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_status_requires_auth(): void
    {
        $this->getJson('/api/admin/ops/clone-live-to-test')->assertUnauthorized();
    }

    public function test_staff_cannot_access(): void
    {
        $this->actingStaff();
        $this->getJson('/api/admin/ops/clone-live-to-test')->assertForbidden();
        $this->postJson('/api/admin/ops/clone-live-to-test', ['confirm' => 'CLONE FROM LIVE'])->assertForbidden();
    }

    public function test_owner_on_blocked_host_gets_unavailable(): void
    {
        config([
            'app.url' => 'https://bakeandgrill.mv',
            'deploy.clone_live_to_test.enabled' => true,
            'deploy.clone_live_to_test.allowed_hosts' => ['test.bakeandgrill.mv'],
            'deploy.clone_live_to_test.blocked_hosts' => ['bakeandgrill.mv', 'www.bakeandgrill.mv'],
        ]);
        $this->actingOwner();

        $this->getJson('/api/admin/ops/clone-live-to-test', ['HTTP_HOST' => 'bakeandgrill.mv'])
            ->assertOk()
            ->assertJson(['available' => false]);

        $this->postJson('/api/admin/ops/clone-live-to-test', ['confirm' => 'CLONE FROM LIVE'], ['HTTP_HOST' => 'bakeandgrill.mv'])
            ->assertNotFound();
    }

    public function test_owner_on_test_host_requires_confirm_phrase(): void
    {
        config([
            'app.url' => 'https://test.bakeandgrill.mv',
            'deploy.clone_live_to_test.enabled' => true,
            'deploy.clone_live_to_test.allowed_hosts' => ['test.bakeandgrill.mv'],
            'deploy.clone_live_to_test.blocked_hosts' => ['bakeandgrill.mv'],
        ]);
        $this->actingOwner();

        $this->postJson('/api/admin/ops/clone-live-to-test', ['confirm' => 'yes'], ['HTTP_HOST' => 'test.bakeandgrill.mv'])
            ->assertStatus(422);
    }

    public function test_owner_on_test_host_can_start_clone(): void
    {
        config([
            'app.url' => 'https://test.bakeandgrill.mv',
            'deploy.clone_live_to_test.enabled' => true,
            'deploy.clone_live_to_test.allowed_hosts' => ['test.bakeandgrill.mv'],
            'deploy.clone_live_to_test.blocked_hosts' => ['bakeandgrill.mv'],
        ]);
        $this->actingOwner();

        $trigger = \Mockery::mock(CloneLiveToTestTrigger::class);
        $trigger->shouldReceive('scriptAvailable')->andReturn(true);
        $trigger->shouldReceive('triggerAsync')->once()->andReturn([
            'ok' => true,
            'message' => 'Clone started',
        ]);
        $trigger->shouldReceive('readStatus')->andReturn([
            'state' => 'running',
            'started_at' => now()->toIso8601String(),
            'finished_at' => null,
            'exit_code' => null,
            'message' => 'Clone started',
        ]);
        $this->app->instance(CloneLiveToTestTrigger::class, $trigger);

        $this->postJson('/api/admin/ops/clone-live-to-test', ['confirm' => 'CLONE FROM LIVE'], ['HTTP_HOST' => 'test.bakeandgrill.mv'])
            ->assertStatus(202)
            ->assertJsonPath('message', 'Clone started');
    }
}
