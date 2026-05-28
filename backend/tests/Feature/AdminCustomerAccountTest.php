<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminCustomerAccountTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@acct.test',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_admin_can_change_customer_phone_and_revokes_tokens(): void
    {
        $customer = Customer::factory()->create(['phone' => '+9607654321']);
        $customer->createToken('customer-test', ['customer']);

        Sanctum::actingAs($this->owner, ['staff']);

        $response = $this->patchJson("/api/admin/customers/{$customer->id}/phone", [
            'phone' => '7972434',
        ]);

        $response->assertOk()
            ->assertJsonPath('customer.phone', '+9607972434')
            ->assertJsonPath('revoked_tokens', 1);

        $this->assertDatabaseHas('customers', [
            'id' => $customer->id,
            'phone' => '+9607972434',
        ]);

        $this->assertSame(0, $customer->tokens()->count());
        $this->assertTrue(
            AuditLog::where('action', 'customer.phone_changed')->where('model_id', $customer->id)->exists(),
        );
    }

    public function test_phone_change_rejects_duplicate_number(): void
    {
        Customer::factory()->create(['phone' => '+9607654321']);
        $other = Customer::factory()->create(['phone' => '+9607123456']);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->patchJson("/api/admin/customers/{$other->id}/phone", ['phone' => '7654321'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_admin_can_merge_duplicate_accounts(): void
    {
        $primary = Customer::factory()->create([
            'phone' => '+9607654321',
            'name' => 'Ahmed',
            'loyalty_points' => 100,
        ]);
        $duplicate = Customer::factory()->create([
            'phone' => '+9607123456',
            'name' => 'Ahmed Alt',
            'loyalty_points' => 50,
        ]);

        LoyaltyAccount::create([
            'customer_id' => $primary->id,
            'points_balance' => 100,
            'points_held' => 0,
            'lifetime_points' => 100,
            'tier' => 'bronze',
        ]);
        LoyaltyAccount::create([
            'customer_id' => $duplicate->id,
            'points_balance' => 50,
            'points_held' => 0,
            'lifetime_points' => 50,
            'tier' => 'bronze',
        ]);

        Order::factory()->create(['customer_id' => $duplicate->id, 'paid_at' => now()]);
        Order::factory()->create(['customer_id' => $primary->id, 'paid_at' => now()->subDay()]);

        Sanctum::actingAs($this->owner, ['staff']);

        $response = $this->postJson("/api/admin/customers/{$primary->id}/merge", [
            'source_customer_ids' => [$duplicate->id],
        ]);

        $response->assertOk()
            ->assertJsonPath('customer.id', $primary->id)
            ->assertJsonCount(1, 'merged');

        $this->assertSoftDeleted('customers', ['id' => $duplicate->id]);
        $this->assertSame(2, Order::where('customer_id', $primary->id)->count());
        $this->assertSame(0, Order::where('customer_id', $duplicate->id)->count());

        $account = LoyaltyAccount::where('customer_id', $primary->id)->first();
        $this->assertSame(150, $account?->points_balance);

        $this->assertTrue(
            AuditLog::where('action', 'customer.accounts_merged')->where('model_id', $primary->id)->exists(),
        );
    }

    public function test_merge_rejects_self_as_source(): void
    {
        $customer = Customer::factory()->create();

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/admin/customers/{$customer->id}/merge", [
            'source_customer_ids' => [$customer->id],
        ])->assertStatus(422);
    }

    public function test_staff_without_permission_cannot_change_phone(): void
    {
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@acct.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::factory()->create();

        Sanctum::actingAs($staff, ['staff']);

        $this->patchJson("/api/admin/customers/{$customer->id}/phone", ['phone' => '7972434'])
            ->assertForbidden();
    }
}
