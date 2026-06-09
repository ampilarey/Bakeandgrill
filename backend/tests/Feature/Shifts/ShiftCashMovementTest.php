<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Models\CashMovement;
use App\Models\Device;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class ShiftCashMovementTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'Shift Staff',
            'email' => 'shift-staff@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'POS Test',
            'identifier' => 'pos-shift-cash-test',
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    public function test_staff_can_record_cash_in_on_open_shift(): void
    {
        $this->preparePosApi($this->staff, $this->device);
        $shift = Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->first();
        $this->assertNotNull($shift);

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements", [
                'type' => 'cash_in',
                'amount' => 150.00,
                'reason' => 'Bank deposit return',
            ]);

        $response->assertCreated();
        $response->assertJsonPath('movement.type', 'cash_in');
        $response->assertJsonPath('movement.amount', '150.00');

        $this->assertSame(1, CashMovement::where('shift_id', $shift->id)->where('type', 'cash_in')->count());
    }

    public function test_cash_movement_rejected_on_closed_shift(): void
    {
        $this->preparePosApi($this->staff, $this->device);
        $shift = Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->first();
        $shift->update(['closed_at' => now(), 'closing_cash' => 100]);

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements", [
                'type' => 'cash_out',
                'amount' => 50.00,
                'reason' => 'Petty cash',
            ]);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Shift is closed.');
    }

    public function test_cash_movement_requires_permission(): void
    {
        $bareRole = Role::firstOrCreate(['slug' => 'bare'], ['name' => 'Bare', 'description' => '', 'is_active' => true]);
        $limited = User::create([
            'name' => 'Limited',
            'email' => 'limited@test.com',
            'password' => Hash::make('password'),
            'role_id' => $bareRole->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);
        $limited->revokePermission('payments.cash_in_out');
        $limited->revokePermission('finance.cash_manage');
        $limited->revokePermission('payments.cash_manage');

        Sanctum::actingAs($limited, ['staff']);
        $shift = Shift::create([
            'user_id' => $limited->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);

        $response = $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$shift->id}/cash-movements", [
                'type' => 'cash_in',
                'amount' => 10,
                'reason' => 'Test',
            ]);

        $response->assertForbidden();
    }

    public function test_staff_cannot_add_cash_movement_to_another_users_shift(): void
    {
        $otherRole = Role::firstOrCreate(['slug' => 'staff2'], ['name' => 'Staff 2', 'description' => '', 'is_active' => true]);
        $other = User::create([
            'name' => 'Other Staff',
            'email' => 'other-shift@test.com',
            'password' => Hash::make('password'),
            'role_id' => $otherRole->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);

        $otherShift = Shift::create([
            'user_id' => $other->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);

        $this->preparePosApi($this->staff, $this->device);

        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/shifts/{$otherShift->id}/cash-movements", [
                'type' => 'cash_in',
                'amount' => 25,
                'reason' => 'Should fail',
            ])
            ->assertNotFound();
    }
}
