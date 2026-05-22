<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PosAdminApiTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner User', 'email' => 'owner-pos-admin@test.com',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff User', 'email' => 'staff-pos-admin@test.com',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        PermissionCatalogSync::sync();
    }

    public function test_owner_can_fetch_pos_overview(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $response = $this->getJson('/api/admin/pos/overview');

        $response->assertOk()
            ->assertJsonStructure([
                'open_shifts_count',
                'open_shifts',
                'active_tickets',
                'pending_devices',
                'today_voids',
                'today_refunds',
                'clocked_in_count',
                'clocked_in',
                'recent_activity',
            ]);
    }

    public function test_staff_without_reports_view_cannot_fetch_overview(): void
    {
        $this->staff->revokePermission('reports.view');
        $this->staff->revokePermission('reports.basic');

        Sanctum::actingAs($this->staff, ['staff']);

        $this->getJson('/api/admin/pos/overview')->assertForbidden();
    }

    public function test_owner_can_list_audit_logs(): void
    {
        AuditLog::create([
            'user_id' => $this->owner->id,
            'action' => 'order.created',
            'model_type' => 'Order',
            'model_id' => 1,
            'old_values' => null,
            'new_values' => ['status' => 'pending'],
            'meta' => null,
            'ip_address' => '127.0.0.1',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $response = $this->getJson('/api/admin/audit-logs');

        $response->assertOk()
            ->assertJsonPath('data.0.action', 'order.created');
    }

    public function test_owner_can_fetch_audit_log_actions(): void
    {
        AuditLog::create([
            'user_id' => $this->owner->id,
            'action' => 'shift.opened',
            'model_type' => 'Shift',
            'model_id' => 2,
            'old_values' => null,
            'new_values' => null,
            'meta' => null,
            'ip_address' => '127.0.0.1',
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->getJson('/api/admin/audit-logs/actions')
            ->assertOk()
            ->assertJsonFragment(['actions' => ['shift.opened']]);
    }

    public function test_owner_can_fetch_staff_options(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->getJson('/api/admin/pos/staff-options')
            ->assertOk()
            ->assertJsonStructure(['staff']);
    }
}
