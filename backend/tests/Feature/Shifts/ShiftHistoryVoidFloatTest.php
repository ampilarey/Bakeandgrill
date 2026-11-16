<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\CashMovement;
use App\Models\Device;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Ops audit, 2026-09-25: shift history takes a date range; a cash
 * movement can be voided with a reason and stops counting; the opening
 * float is checked against the last close on the same till.
 */
class ShiftHistoryVoidFloatTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private User $owner;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create(['name' => 'Shift Staff', 'email' => 'shift-staff@test.com', 'password' => Hash::make('password'), 'role_id' => $role->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true]);
        $this->owner = $this->makeOwner(['name' => 'Ahmed', 'phone' => '+9607770001']);
        $this->device = Device::create(['name' => 'Front till', 'identifier' => 'pos-hvf-test', 'type' => 'pos', 'is_active' => true]);
    }

    public function test_history_filters_by_date_and_cashier(): void
    {
        foreach ([['2026-09-01', $this->staff], ['2026-09-15', $this->staff], ['2026-09-20', $this->owner]] as [$day, $user]) {
            Shift::create(['user_id' => $user->id, 'device_id' => $this->device->id, 'opened_at' => "{$day} 09:00:00", 'closed_at' => "{$day} 17:00:00", 'opening_cash' => 100, 'closing_cash' => 100]);
        }
        Sanctum::actingAs($this->owner, ['staff']);
        $this->assertCount(3, $this->getJson('/api/shifts/history')->assertOk()->json('shifts'));
        $this->assertCount(2, $this->getJson('/api/shifts/history?from=2026-09-10')->assertOk()->json('shifts'));
        $this->assertCount(1, $this->getJson('/api/shifts/history?from=2026-09-10&to=2026-09-16')->assertOk()->json('shifts'));
        $this->assertCount(2, $this->getJson('/api/shifts/history?user_id=' . $this->staff->id)->assertOk()->json('shifts'));
        $this->getJson('/api/shifts/history?limit=5')->assertStatus(422);
    }

    public function test_a_cash_movement_can_be_voided_with_a_reason_and_stops_counting(): void
    {
        $this->preparePosApi($this->staff, $this->device);
        $shift = Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->firstOrFail();
        $id = (int) $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements", ['type' => 'cash_in', 'amount' => 150.00, 'reason' => 'Typo: meant 15'])
            ->assertCreated()->json('movement.id');
        $this->assertSame(150.0, (float) $this->withHeader('X-Device-Identifier', $this->device->identifier)->getJson("/api/shifts/{$shift->id}/summary")->assertOk()->json('cash_drawer.paid_in'));

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements/{$id}/void", ['reason' => 'x'])->assertStatus(422); // reason too short
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements/{$id}/void", ['reason' => 'Entered 150 instead of 15'])->assertOk()
            ->assertJsonPath('movement.void_reason', 'Entered 150 instead of 15');
        $this->assertNotNull(CashMovement::findOrFail($id)->voided_at);
        $this->assertSame(0.0, (float) $this->withHeader('X-Device-Identifier', $this->device->identifier)->getJson("/api/shifts/{$shift->id}/summary")->assertOk()->json('cash_drawer.paid_in'));
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements/{$id}/void", ['reason' => 'Again'])->assertStatus(422);

        $shift->update(['closed_at' => now()]);
        $other = CashMovement::create(['shift_id' => $shift->id, 'user_id' => $this->staff->id, 'type' => 'cash_out', 'amount' => 20, 'reason' => 'Late']);
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements/{$other->id}/void", ['reason' => 'Too late now'])->assertStatus(422);
    }

    /**
     * Owner, 2026-11-16: "Why the short msg is in shift opening? New shift opening and last shift closing has no
     * relation": the takings leave the drawer after the close count, so the opening cash is never held to it.
     */
    public function test_the_opening_cash_is_not_compared_with_the_last_close(): void
    {
        Shift::create(['user_id' => $this->owner->id, 'device_id' => $this->device->id, 'opened_at' => now()->subDay(), 'closed_at' => now()->subHours(10), 'opening_cash' => 100, 'closing_cash' => 738]);

        Sanctum::actingAs($this->staff, ['staff']);
        $res = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/shifts/open', ['opening_cash' => 300])->assertCreated();
        $this->assertNull($res->json('float_check'));
        $shift = Shift::findOrFail((int) $res->json('shift.id'));
        $this->assertNull($shift->opening_float_expected);
        $this->assertNull($shift->opening_float_variance);
        $this->assertSame(0, SmsLog::query()->where('message', 'like', '%last close%')->count(), 'nobody is told the drawer is short');
    }
}
