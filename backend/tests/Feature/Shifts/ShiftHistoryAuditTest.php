<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Shift history audit, 2026-10-02: a force-close is recorded as such, the
 * list names cashier and till, and one till holds one open shift unless a
 * manager opens over it.
 */
class ShiftHistoryAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private User $other;

    private User $owner;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create(['name' => 'Hassan', 'email' => 'hassan@test.com', 'password' => Hash::make('password'), 'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true]);
        $this->other = User::create(['name' => 'Aisha', 'email' => 'aisha@test.com', 'password' => Hash::make('password'), 'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true]);
        $this->owner = $this->makeOwner(['name' => 'Ahmed']);
        $this->device = Device::create(['name' => 'Front till', 'identifier' => 'pos-sha-test', 'type' => 'pos', 'is_active' => true]);
    }

    private function onTill(): static
    {
        return $this->withHeader('X-Device-Identifier', $this->device->identifier);
    }

    public function test_a_force_close_is_recorded_and_the_history_names_cashier_till_and_closer(): void
    {
        $shift = Shift::create(['user_id' => $this->staff->id, 'device_id' => $this->device->id, 'opened_at' => now()->subHours(30), 'opening_cash' => 100]);

        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson("/api/shifts/{$shift->id}/force-close", ['notes' => 'Left open overnight'])->assertOk();

        $shift->refresh();
        $this->assertNotNull($shift->force_closed_at);
        $this->assertSame($this->owner->id, $shift->force_closed_by);
        $this->assertStringContainsString('[Force closed by Ahmed]', (string) $shift->notes);

        $row = $this->getJson('/api/shifts/history')->assertOk()->json('shifts.0');
        $this->assertSame($shift->id, $row['id']);
        $this->assertSame('Hassan', $row['user']['name']);
        $this->assertSame('Front till', $row['device']['name']);
        $this->assertSame('Ahmed', $row['force_closer']['name']);
        $this->assertNotNull($row['force_closed_at']);

        // A counted close carries neither.
        $counted = Shift::create(['user_id' => $this->staff->id, 'device_id' => $this->device->id, 'opened_at' => now()->subHours(5), 'closed_at' => now()->subHour(), 'opening_cash' => 100, 'closing_cash' => 100, 'expected_cash' => 100, 'variance' => 0]);
        $rows = collect($this->getJson('/api/shifts/history')->assertOk()->json('shifts'));
        $this->assertNull($rows->firstWhere('id', $counted->id)['force_closed_at']);
        $this->assertNull($rows->firstWhere('id', $counted->id)['force_closer']);
    }

    public function test_the_live_list_shows_every_open_shift_with_cashier_and_till(): void
    {
        Shift::create(['user_id' => $this->staff->id, 'device_id' => $this->device->id, 'opened_at' => now()->subHour(), 'opening_cash' => 100]);
        Shift::create(['user_id' => $this->other->id, 'device_id' => null, 'opened_at' => now()->subMinutes(10), 'opening_cash' => 50]);
        Shift::create(['user_id' => $this->other->id, 'device_id' => $this->device->id, 'opened_at' => now()->subDay(), 'closed_at' => now()->subHours(20), 'opening_cash' => 0, 'closing_cash' => 0]);

        Sanctum::actingAs($this->owner, ['staff']);
        $live = $this->getJson('/api/shifts/live')->assertOk()->json('shifts');
        $this->assertCount(2, $live);
        $this->assertSame(['Aisha', 'Hassan'], array_column(array_column($live, 'user'), 'name'));
        $this->assertSame('Front till', $live[1]['device']['name']);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->staff, ['staff']);
        $this->getJson('/api/shifts/live')->assertStatus(403);
    }

    public function test_a_till_with_someone_elses_open_shift_refuses_a_cashier_and_lets_a_manager_open_over_it(): void
    {
        $theirs = Shift::create(['user_id' => $this->other->id, 'device_id' => $this->device->id, 'opened_at' => now()->subHours(3), 'opening_cash' => 100]);

        Sanctum::actingAs($this->staff, ['staff']);
        $res = $this->onTill()->postJson('/api/shifts/open', ['opening_cash' => 100])->assertStatus(409);
        $this->assertStringContainsString('Aisha has shift #' . $theirs->id . ' open on this till since', (string) $res->json('message'));
        $this->assertStringContainsString('ask a manager', (string) $res->json('message'));
        $this->assertFalse($res->json('can_override'));
        $this->assertSame('Aisha', $res->json('open_shift.user_name'));
        // Saying "override" without the permission changes nothing.
        $this->onTill()->postJson('/api/shifts/open', ['opening_cash' => 100, 'override' => true])->assertStatus(409);
        $this->assertSame(1, Shift::whereNull('closed_at')->count());

        // A different till is not blocked by it.
        $spare = Device::create(['name' => 'Spare till', 'identifier' => 'pos-sha-spare', 'type' => 'pos', 'is_active' => true]);
        $this->withHeader('X-Device-Identifier', $spare->identifier)->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->owner, ['staff']);
        $res = $this->onTill()->postJson('/api/shifts/open', ['opening_cash' => 200])->assertStatus(409);
        $this->assertTrue($res->json('can_override'));
        $this->assertStringContainsString('open anyway as a manager', (string) $res->json('message'));

        $opened = $this->onTill()->postJson('/api/shifts/open', ['opening_cash' => 200, 'override' => true])->assertCreated()->json('shift');
        $this->assertStringContainsString("[Opened over Aisha's open shift #{$theirs->id}]", (string) $opened['notes']);
        $this->assertStringContainsString("Ahmed opened shift #{$opened['id']} over this one", (string) $theirs->fresh()->notes);
        $this->assertNull($theirs->fresh()->closed_at, 'the other shift is left for a count or a force-close');
    }
}
