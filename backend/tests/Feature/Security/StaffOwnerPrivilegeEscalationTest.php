<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Managers with staff.update must never take over Owner accounts.
 */
class StaffOwnerPrivilegeEscalationTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    private User $staff;

    private int $ownerRoleId;

    private int $managerRoleId;

    private int $staffRoleId;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->ownerRoleId = (int) Role::where('slug', 'owner')->value('id');
        $this->managerRoleId = (int) Role::where('slug', 'manager')->value('id');
        $this->staffRoleId = (int) Role::where('slug', 'staff')->value('id');

        $this->owner = User::create([
            'name' => 'Owner One',
            'email' => 'owner1@test.local',
            'password' => Hash::make('password'),
            'role_id' => $this->ownerRoleId,
            'pin_hash' => Hash::make('1111'),
            'is_active' => true,
        ]);

        $this->manager = User::create([
            'name' => 'Manager One',
            'email' => 'manager1@test.local',
            'password' => Hash::make('password'),
            'role_id' => $this->managerRoleId,
            'pin_hash' => Hash::make('2222'),
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff One',
            'email' => 'staff1@test.local',
            'password' => Hash::make('password'),
            'role_id' => $this->staffRoleId,
            'pin_hash' => Hash::make('3333'),
            'is_active' => true,
        ]);
    }

    public function test_manager_cannot_promote_self_to_owner(): void
    {
        $this->patchJson(
            "/api/admin/staff/{$this->manager->id}",
            ['role_id' => $this->ownerRoleId],
            $this->staffHeaders($this->manager),
        )->assertForbidden();

        $this->assertSame($this->managerRoleId, (int) $this->manager->fresh()->role_id);
    }

    public function test_manager_cannot_promote_another_user_to_owner(): void
    {
        $this->patchJson(
            "/api/admin/staff/{$this->staff->id}",
            ['role_id' => $this->ownerRoleId],
            $this->staffHeaders($this->manager),
        )->assertForbidden();

        $this->assertSame($this->staffRoleId, (int) $this->staff->fresh()->role_id);
    }

    public function test_manager_cannot_reset_owner_pin(): void
    {
        $this->postJson(
            "/api/admin/staff/{$this->owner->id}/pin",
            ['pin' => '9999'],
            $this->staffHeaders($this->manager),
        )->assertForbidden();

        $this->assertTrue(Hash::check('1111', $this->owner->fresh()->pin_hash));
    }

    public function test_manager_cannot_edit_or_deactivate_owner(): void
    {
        $this->patchJson(
            "/api/admin/staff/{$this->owner->id}",
            ['name' => 'Hijacked'],
            $this->staffHeaders($this->manager),
        )->assertForbidden();

        $this->patchJson(
            "/api/admin/staff/{$this->owner->id}",
            ['is_active' => false],
            $this->staffHeaders($this->manager),
        )->assertForbidden();

        $owner = $this->owner->fresh();
        $this->assertSame('Owner One', $owner->name);
        $this->assertTrue($owner->is_active);
    }

    public function test_manager_cannot_demote_owner(): void
    {
        $secondOwner = User::create([
            'name' => 'Owner Two',
            'email' => 'owner2@test.local',
            'password' => Hash::make('password'),
            'role_id' => $this->ownerRoleId,
            'pin_hash' => Hash::make('4444'),
            'is_active' => true,
        ]);

        $this->patchJson(
            "/api/admin/staff/{$secondOwner->id}",
            ['role_id' => $this->staffRoleId],
            $this->staffHeaders($this->manager),
        )->assertForbidden();

        $this->assertSame($this->ownerRoleId, (int) $secondOwner->fresh()->role_id);
    }

    public function test_owner_can_manage_another_owner_when_safe(): void
    {
        $secondOwner = User::create([
            'name' => 'Owner Two',
            'email' => 'owner2@test.local',
            'password' => Hash::make('password'),
            'role_id' => $this->ownerRoleId,
            'pin_hash' => Hash::make('4444'),
            'is_active' => true,
        ]);

        $this->patchJson(
            "/api/admin/staff/{$secondOwner->id}",
            ['name' => 'Owner Two Updated'],
            $this->staffHeaders($this->owner),
        )->assertOk()
            ->assertJsonPath('staff.name', 'Owner Two Updated');

        $this->postJson(
            "/api/admin/staff/{$secondOwner->id}/pin",
            ['pin' => '5555'],
            $this->staffHeaders($this->owner),
        )->assertOk();

        $this->assertTrue(Hash::check('5555', $secondOwner->fresh()->pin_hash));
    }

    public function test_last_active_owner_cannot_be_demoted_or_deactivated(): void
    {
        $headers = $this->staffHeaders($this->owner);

        $this->patchJson(
            "/api/admin/staff/{$this->owner->id}",
            ['role_id' => $this->managerRoleId],
            $headers,
        )->assertStatus(422);

        $this->patchJson(
            "/api/admin/staff/{$this->owner->id}",
            ['is_active' => false],
            $headers,
        )->assertStatus(422);

        $owner = $this->owner->fresh();
        $this->assertSame($this->ownerRoleId, (int) $owner->role_id);
        $this->assertTrue($owner->is_active);
    }

    public function test_manager_can_still_update_ordinary_staff(): void
    {
        $this->patchJson(
            "/api/admin/staff/{$this->staff->id}",
            [
                'name' => 'Staff Updated',
                'phone' => '+9607770001',
            ],
            $this->staffHeaders($this->manager),
        )->assertOk()
            ->assertJsonPath('staff.name', 'Staff Updated')
            ->assertJsonPath('staff.phone', '+9607770001');

        $this->assertSame($this->staffRoleId, (int) $this->staff->fresh()->role_id);
    }
}
