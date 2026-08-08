<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StaffRefundPermissionTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->staff = User::create([
            'name' => 'Refund Staff',
            'email' => 'refund-staff@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_staff_without_refund_permission_cannot_issue_refund(): void
    {
        $this->staff->revokePermission('orders.refund');
        $this->staff->revokePermission('orders.refund_request');
        Sanctum::actingAs($this->staff, ['staff']);

        $order = Order::factory()->paid()->create();

        $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10,
            'reason_category' => 'other', 'reason' => 'Test refund',
        ])->assertForbidden();
    }
}
