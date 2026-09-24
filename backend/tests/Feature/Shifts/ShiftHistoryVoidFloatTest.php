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

    public function test_the_opening_float_is_checked_against_the_last_close_on_the_till(): void
    {
        Shift::create(['user_id' => $this->owner->id, 'device_id' => $this->device->id, 'opened_at' => now()->subDay(), 'closed_at' => now()->subHours(10), 'opening_cash' => 100, 'closing_cash' => 500]);

        Sanctum::actingAs($this->staff, ['staff']);
        $res = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/shifts/open', ['opening_cash' => 440])->assertCreated();
        $this->assertSame(500.0, (float) $res->json('float_check.expected'));
        $this->assertSame(-60.0, (float) $res->json('float_check.variance'));
        $this->assertStringContainsString('left MVR 500.00 in the drawer; you opened with MVR 440.00 (short MVR 60.00)', (string) $res->json('float_check.message'));
        $shift = Shift::findOrFail((int) $res->json('shift.id'));
        $this->assertSame(-60.0, (float) $shift->opening_float_variance);

        $alert = SmsLog::where('type', 'owner_shift_float_mismatch')->firstOrFail();
        $this->assertSame('+9607770001', $alert->to);
        $this->assertStringContainsString("Shift #{$shift->id} opened by Shift Staff", (string) $alert->message);

        // Matching float: no message, no alert; a till with no history: nothing to compare.
        $shift->update(['closed_at' => now(), 'closing_cash' => 440]);
        $res2 = $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/shifts/open', ['opening_cash' => 440])->assertCreated();
        $this->assertNull($res2->json('float_check.message'));
        $this->assertSame(1, SmsLog::where('type', 'owner_shift_float_mismatch')->count());
    }
}
