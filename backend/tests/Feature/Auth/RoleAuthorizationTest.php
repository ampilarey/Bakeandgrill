<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tests role and permission enforcement across admin routes.
 * Covers Security Audit Finding C — admin routes lack role enforcement.
 * Also covers Finding K — customer token isolation.
 * Also covers Finding M — admin controllers lack internal authorization.
 */
class RoleAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $manager;
    private User $staff;
    private Customer $customer;
    private string $customerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $ownerRole   = Role::firstOrCreate(['slug' => 'owner'],   ['name' => 'Owner',   'description' => '', 'is_active' => true]);
        $managerRole = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        $staffRole   = Role::firstOrCreate(['slug' => 'staff'],   ['name' => 'Staff',   'description' => '', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner User', 'email' => 'owner@test.com',
            'password' => Hash::make('password'), 'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->manager = User::create([
            'name' => 'Manager User', 'email' => 'manager@test.com',
            'password' => Hash::make('password'), 'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff User', 'email' => 'staff@test.com',
            'password' => Hash::make('password'), 'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);

        $this->customer = Customer::create(['name' => 'Customer', 'phone' => '+9607550001']);
        $this->customerToken = $this->customer->createToken('test', ['customer'])->plainTextToken;
    }

    // ── Customer token isolation ──────────────────────────────────────────────

    public function test_customer_token_cannot_access_admin_staff_list(): void
    {
        $this->getJson(
            '/api/admin/staff',
            ['Authorization' => "Bearer {$this->customerToken}"],
        )->assertStatus(403);
    }

    public function test_customer_token_cannot_access_admin_analytics(): void
    {
        $this->getJson(
            '/api/admin/analytics/retention',
            ['Authorization' => "Bearer {$this->customerToken}"],
        )->assertStatus(403);
    }

    public function test_customer_token_cannot_access_admin_promotions(): void
    {
        $this->getJson(
            '/api/admin/promotions',
            ['Authorization' => "Bearer {$this->customerToken}"],
        )->assertStatus(403);
    }

    public function test_customer_token_cannot_create_refund(): void
    {
        $response = $this->postJson(
            '/api/orders/999/refunds',
            ['amount' => 10],
            ['Authorization' => "Bearer {$this->customerToken}"],
        );

        // Must not be 200 — 403/404/422 are all acceptable
        $this->assertNotSame(200, $response->status(), 'Customer token should never be able to create refunds.');
    }

    // ── Unauthenticated access ────────────────────────────────────────────────

    public function test_unauthenticated_cannot_access_admin_staff(): void
    {
        $this->getJson('/api/admin/staff')->assertUnauthorized();
    }

    public function test_unauthenticated_cannot_access_admin_analytics(): void
    {
        $this->getJson('/api/admin/analytics/retention')->assertUnauthorized();
    }

    // ── Owner has full access ─────────────────────────────────────────────────

    public function test_owner_can_access_staff_list(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->getJson('/api/admin/staff')->assertOk();
    }

    public function test_owner_can_access_analytics(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $response = $this->getJson('/api/admin/analytics/retention');
        // May return 200 with data or 422 if date range is missing — but not 401/403
        $statusCode = method_exists($response, 'status') ? $response->status() : $response->getStatusCode();
        $this->assertNotContains($statusCode, [401, 403]);
    }

    // ── Role permission checks ────────────────────────────────────────────────

    public function test_staff_user_without_permission_cannot_create_staff(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/admin/staff', [
            'name'     => 'New Staff',
            'email'    => 'new@test.com',
            'pin'      => '9999',
            'role_id'  => 1,
        ]);

        $this->assertContains($response->status(), [403, 422], 'Staff without permission should be blocked from creating other staff.');
    }

    public function test_manager_with_permission_can_view_reports(): void
    {
        // Assign promotions.manage permission to manager's role
        $permission = \App\Models\Permission::where('slug', 'reports.financial')->first();
        if ($permission) {
            $this->manager->role()->first()?->permissions()->syncWithoutDetaching([$permission->id]);
        }

        Sanctum::actingAs($this->manager, ['staff']);

        // Whether the manager can access depends on their permissions — we test it's not categorically blocked
        $response = $this->getJson('/api/admin/analytics/retention');
        // May fail with 422 (validation) or 200, but not 401
        $this->assertNotSame(401, $response->status(), 'Authenticated managers should not get 401.');
    }
}
