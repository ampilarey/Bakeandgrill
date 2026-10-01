<?php

declare(strict_types=1);

namespace Tests\Feature\Staff;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SmsLog;
use App\Models\User;
use App\Services\StaffAccountLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Staff, roles and permissions audit, 2026-10-01.
 */
class StaffAccountSafetyTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    private User $otherManager;

    private User $staff;

    /** @var array<string, int> */
    private array $roles = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff'] as $slug => $name) {
            $this->roles[$slug] = (int) Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true])->id;
        }
        PermissionCatalogSync::sync();

        $this->owner = $this->person('Owner', 'owner', '7771111');
        $this->manager = $this->person('Mina', 'manager', '7772222');
        $this->otherManager = $this->person('Moosa', 'manager', '7773333');
        $this->staff = $this->person('Sara', 'staff', '7774444');

        foreach ([$this->manager, $this->otherManager] as $m) {
            foreach (['staff.view', 'staff.create', 'staff.update', 'staff.delete', 'roles_permissions.manage'] as $p) {
                $m->grantPermission($p);
            }
        }
    }

    private function person(string $name, string $role, string $phone): User
    {
        return User::create([
            'name' => $name,
            'email' => strtolower($name) . '@test.local',
            'phone' => $phone,
            'password' => Hash::make('correct-horse'),
            'role_id' => $this->roles[$role],
            'pin_hash' => Hash::make('4826'),
            'is_active' => true,
        ]);
    }

    public function test_removing_someone_with_records_archives_them_and_keeps_the_records(): void
    {
        $shiftId = DB::table('shifts')->insertGetId(['opened_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('cash_movements')->insert([
            'shift_id' => $shiftId, 'user_id' => $this->staff->id, 'type' => 'out', 'amount' => 50,
            'reason' => 'Ice', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $res = $this->deleteJson("/api/admin/staff/{$this->staff->id}", [], $this->staffHeaders($this->owner))
            ->assertOk()
            ->assertJsonPath('archived', true);
        $this->assertStringContainsString('archived', $res->json('message'));

        $this->assertDatabaseHas('users', ['id' => $this->staff->id, 'is_active' => false, 'pin_hash' => null]);
        $this->assertSame(1, DB::table('cash_movements')->where('user_id', $this->staff->id)->count(), 'the cash record survives');
        $this->assertTrue(AuditLog::where('action', 'staff.archived')->where('model_id', $this->staff->id)->exists());
    }

    public function test_an_account_nobody_used_is_deleted_and_that_is_on_the_record(): void
    {
        $id = $this->staff->id;
        $this->deleteJson("/api/admin/staff/{$id}", [], $this->staffHeaders($this->owner))
            ->assertOk()
            ->assertJsonPath('archived', false);

        $this->assertDatabaseMissing('users', ['id' => $id]);
        $this->assertTrue(AuditLog::where('action', 'staff.deleted')->where('model_id', $id)->exists());
    }

    public function test_creating_staff_is_on_the_record(): void
    {
        $this->postJson('/api/admin/staff', [
            'name' => 'New Cook', 'email' => 'cook@test.local', 'role_id' => $this->roles['staff'], 'pin' => '4826',
        ], $this->staffHeaders($this->owner))->assertCreated();

        $this->assertTrue(AuditLog::where('action', 'staff.created')->exists());
    }

    public function test_a_manager_cannot_take_over_another_manager(): void
    {
        $headers = $this->staffHeaders($this->manager);

        $this->postJson("/api/admin/staff/{$this->otherManager->id}/pin", ['pin' => '7391'], $headers)->assertForbidden();
        $this->deleteJson("/api/admin/staff/{$this->otherManager->id}/two-factor", [], $headers)->assertForbidden();
        $this->patchJson("/api/admin/staff/{$this->otherManager->id}", ['is_active' => false], $headers)->assertForbidden();
        $this->patchJson("/api/admin/staff/{$this->staff->id}", ['role_id' => $this->roles['manager']], $headers)->assertForbidden();
        $this->postJson('/api/admin/staff', [
            'name' => 'Another', 'email' => 'another@test.local', 'role_id' => $this->roles['manager'], 'pin' => '4826',
        ], $headers)->assertForbidden();

        // Below them is still theirs to manage.
        $this->postJson("/api/admin/staff/{$this->staff->id}/pin", ['pin' => '7391'], $headers)->assertOk();
    }

    public function test_a_manager_cannot_widen_roles_beyond_what_they_hold(): void
    {
        $headers = $this->staffHeaders($this->manager);
        $lacking = \App\Models\Permission::orderBy('slug')->pluck('slug')
            ->first(fn (string $slug) => !$this->manager->fresh()->hasPermission($slug));
        $this->assertNotNull($lacking);

        // Not their own role at all, and not something they lack on another.
        $this->putJson('/api/roles/manager/permissions', ['permissions' => ['staff.view' => true]], $headers)
            ->assertForbidden();
        $this->putJson('/api/roles/staff/permissions', ['permissions' => [$lacking => true]], $headers)
            ->assertForbidden();

        // What they hold they may hand down, and a partial save leaves the rest alone.
        $before = collect(app(\App\Services\PermissionService::class)->rolePermissions('staff'))->where('granted', true)->count();
        $this->putJson('/api/roles/staff/permissions', ['permissions' => ['staff.view' => true]], $headers)->assertOk();
        $after = collect(app(\App\Services\PermissionService::class)->rolePermissions('staff'))->where('granted', true)->count();
        $this->assertSame($before + 1, $after);
    }

    public function test_a_pin_reset_signs_the_person_out_of_admin_browsers_too(): void
    {
        DB::table('sessions')->insert([
            'id' => 'lost-phone-session', 'user_id' => $this->staff->id, 'ip_address' => '1.2.3.4',
            'user_agent' => 'phone', 'payload' => '', 'last_activity' => time(),
        ]);
        $this->staff->forceFill(['remember_token' => 'old-remember-token'])->saveQuietly();
        $this->staff->createToken('staff-pos-' . $this->staff->id, ['staff']);

        $this->postJson("/api/admin/staff/{$this->staff->id}/pin", ['pin' => '7391'], $this->staffHeaders($this->owner))
            ->assertOk();

        $this->assertSame(0, DB::table('sessions')->where('user_id', $this->staff->id)->count());
        $this->assertNotSame('old-remember-token', $this->staff->fresh()->remember_token);
        $this->assertSame(0, $this->staff->tokens()->count());
    }

    public function test_thirty_wrong_sign_ins_lock_the_account_whatever_it_is_typed_as_and_tell_the_owner(): void
    {
        // Half as the email and half as the phone, each from a fresh address,
        // so none of the short limits ever trips.
        for ($i = 0; $i < StaffAccountLock::LIMIT; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '10.0.' . intdiv($i, 250) . '.' . ($i % 250 + 1)])
                ->postJson('/api/auth/staff/pin-login', [
                    'username' => $i % 2 === 0 ? 'sara@test.local' : '7774444',
                    'pin' => sprintf('%04d', 1000 + $i),
                ])
                ->assertStatus(422);
        }

        // The right PIN no longer gets in, from anywhere, by any route.
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.9.9'])
            ->postJson('/api/auth/staff/pin-login', ['username' => 'sara@test.local', 'pin' => '4826'])
            ->assertStatus(422)
            ->assertJsonFragment(['Too many attempts. Try again in 1440 minutes.']);
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.9.8'])
            ->postJson('/api/auth/staff/pos-password-login', ['username' => '7774444', 'password' => 'correct-horse'])
            ->assertStatus(422);

        $alert = SmsLog::where('type', 'owner_staff_login_locked')->first();
        $this->assertNotNull($alert, 'the owner is told');
        $this->assertStringContainsString('Sara', (string) $alert->message);

        // An owner resetting the PIN lifts it.
        $this->postJson("/api/admin/staff/{$this->staff->id}/pin", ['pin' => '7391'], $this->staffHeaders($this->owner))->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.9.7'])
            ->postJson('/api/auth/staff/pin-login', ['username' => 'sara@test.local', 'pin' => '7391'])
            ->assertOk();
    }
}
