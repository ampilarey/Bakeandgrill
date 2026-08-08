<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Sensitive financial and access-control operations must leave audit trail rows.
 */
class AuditLogCoverageTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        PermissionCatalogSync::sync();

        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@audit.test',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Staff',
            'email' => 'staff@audit.test',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->customer = $this->makeCustomer();
    }

    public function test_void_creates_audit_log_with_actor_and_status_change(): void
    {
        $order = Order::factory()->pending()->create([
            'user_id' => $this->owner->id,
            'type' => 'dine_in',
            'total' => 25.00,
            'total_laar' => 2500,
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/orders/{$order->id}/cancel", [
            'reason' => 'Wrong ticket',
        ])->assertOk();

        $log = AuditLog::where('action', 'order.cancelled')
            ->where('model_type', 'Order')
            ->where('model_id', $order->id)
            ->first();

        $this->assertNotNull($log);
        $this->assertSame($this->owner->id, $log->user_id);
        $this->assertSame('pending', $log->old_values['status'] ?? null);
        $this->assertSame('cancelled', $log->new_values['status'] ?? null);
        $this->assertSame('Wrong ticket', $log->new_values['reason'] ?? null);
    }

    public function test_refund_creates_audit_log_linked_to_refund_and_order(): void
    {
        $device = $this->makeDevice('pos', ['identifier' => 'AUDIT-REFUND-POS']);
        Shift::create([
            'user_id' => $this->owner->id,
            'device_id' => $device->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);

        $order = Order::factory()->paid()->create([
            'customer_id' => $this->customer->id,
            'total' => 50.00,
            'total_laar' => 5000,
            'subtotal' => 50.00,
            'tax_amount' => 0,
        ]);

        Sanctum::actingAs($this->owner, ['staff']);

        $response = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 10.00,
            'reason_category' => 'other', 'reason' => 'Customer request',
        ])->assertCreated();

        $refundId = (int) $response->json('refund.id');

        $requested = AuditLog::where('action', 'refund.requested')
            ->where('model_type', 'Refund')
            ->where('model_id', $refundId)
            ->first();
        $this->assertNotNull($requested);
        $this->assertSame($this->owner->id, $requested->user_id);
        $this->assertSame($order->id, $requested->meta['order_id'] ?? null);

        // Owner auto-approves — approval audit trail must exist too.
        $approved = AuditLog::where('action', 'refund.approved')
            ->where('model_type', 'Refund')
            ->where('model_id', $refundId)
            ->first();
        $this->assertNotNull($approved);
        $this->assertSame($order->id, $approved->meta['order_id'] ?? null);

        $this->assertDatabaseHas('refunds', ['id' => $refundId, 'order_id' => $order->id]);
    }

    public function test_deposit_adjustment_creates_audit_log(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/top-up", [
            'amount_mvr' => 50,
            'method' => 'cash',
            'reference' => 'TOP-001',
        ])->assertCreated();

        $this->postJson("/api/admin/customers/{$this->customer->id}/deposit/adjust", [
            'amount_laar' => 2500,
            'notes' => 'Goodwill credit',
        ])->assertCreated();

        $log = AuditLog::where('action', 'customer.deposit.adjustment')
            ->where('model_id', $this->customer->id)
            ->first();

        $this->assertNotNull($log);
        $this->assertSame($this->owner->id, $log->user_id);
    }

    public function test_gift_card_issue_creates_audit_log(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $response = $this->postJson('/api/admin/gift-cards', [
            'amount' => 25.00,
        ])->assertCreated();

        $cardId = (int) $response->json('gift_card.id');

        $log = AuditLog::where('action', 'gift_card.issued')
            ->where('model_type', 'GiftCard')
            ->where('model_id', $cardId)
            ->first();

        $this->assertNotNull($log);
        $this->assertSame($this->owner->id, $log->user_id);
        $this->assertEquals(25, $log->new_values['initial_balance'] ?? null);
    }

    public function test_user_permission_update_creates_audit_log(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $this->putJson("/api/users/{$this->staff->id}/permissions", [
            'permissions' => [
                'orders.void' => true,
            ],
        ])->assertOk();

        $log = AuditLog::where('action', 'user.permissions.updated')
            ->where('model_type', 'User')
            ->where('model_id', $this->staff->id)
            ->first();

        $this->assertNotNull($log);
        $this->assertSame($this->owner->id, $log->user_id);
        $this->assertContains('orders.void', $log->meta['changed'] ?? []);
    }
}
