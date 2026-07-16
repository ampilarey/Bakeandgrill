<?php

declare(strict_types=1);

namespace Tests\Feature\Shifts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CurrentShiftTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_shift_returns_logged_in_staff_open_shift_for_ring_sales_user(): void
    {
        PermissionCatalogSync::sync();

        $role = Role::firstOrCreate(['slug' => 'cashier'], ['name' => 'Cashier', 'description' => '', 'is_active' => true]);
        $staff = User::create([
            'name' => 'Current Shift Staff',
            'email' => 'current-shift@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $staff->grantPermission('pos.ring_sales');

        $other = User::create([
            'name' => 'Other Shift Staff',
            'email' => 'other-current-shift@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);

        Shift::create([
            'user_id' => $other->id,
            'opened_at' => now()->subHour(),
            'opening_cash' => 200,
        ]);
        $shift = Shift::create([
            'user_id' => $staff->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $this->getJson('/api/shifts/current')
            ->assertOk()
            ->assertJsonPath('shift.id', $shift->id)
            ->assertJsonPath('shift.user_id', $staff->id);
    }
}
