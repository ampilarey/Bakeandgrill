<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Batch A — receipt / order-stream AuthZ.
 * Does not send SMS to a real phone (send asserts middleware before delivery).
 */
class ReceiptAndStreamPermissionTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $customer = Customer::create([
            'name' => 'Receipt AuthZ Customer',
            'phone' => '+9607005555',
            'email' => 'receipt-authz@example.com',
            'is_active' => true,
        ]);

        $this->order = Order::create([
            'order_number' => 'AUTHZ-RCPT-1',
            'type' => 'takeaway',
            'status' => 'completed',
            'customer_id' => $customer->id,
            'subtotal' => 10,
            'total' => 10,
        ]);
    }

    private function staffWithSlugs(array $slugs, string $email): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'authz-empty-'.md5($email)],
            ['name' => 'AuthZ Empty', 'description' => 'No default perms', 'is_active' => true],
        );
        $role->permissions()->sync([]);

        $user = User::create([
            'name' => 'AuthZ Staff',
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        foreach ($slugs as $slug) {
            Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'group' => 'Orders'],
            );
            $user->grantPermission($slug);
        }
        $user->unsetRelation('permissions');

        return $user;
    }

    public function test_empty_perm_staff_forbidden_from_receipt_link(): void
    {
        Sanctum::actingAs($this->staffWithSlugs([], 'empty-link@test.com'), ['staff']);

        $this->getJson("/api/orders/{$this->order->id}/receipt-link")
            ->assertForbidden();
    }

    public function test_empty_perm_staff_forbidden_from_receipt_send(): void
    {
        Sanctum::actingAs($this->staffWithSlugs([], 'empty-send@test.com'), ['staff']);

        // No real SMS — middleware must 403 before controller delivery.
        $this->postJson("/api/receipts/{$this->order->id}/send", [
            'channel' => 'email',
            'recipient' => 'receipt-authz@example.com',
        ])->assertForbidden();
    }

    public function test_orders_receipts_allows_receipt_link_and_send(): void
    {
        Sanctum::actingAs(
            $this->staffWithSlugs(['orders.receipts'], 'receipts-only@test.com'),
            ['staff'],
        );

        $this->getJson("/api/orders/{$this->order->id}/receipt-link")
            ->assertOk()
            ->assertJsonStructure(['link']);

        $this->postJson("/api/receipts/{$this->order->id}/send", [
            'channel' => 'email',
            'recipient' => 'receipt-authz@example.com',
        ])->assertCreated();
    }

    public function test_orders_view_alias_satisfies_orders_receipts_middleware(): void
    {
        // Documents SATISFIED_BY: orders.receipts => [orders.view]
        Sanctum::actingAs(
            $this->staffWithSlugs(['orders.view'], 'view-only-receipts@test.com'),
            ['staff'],
        );

        $this->getJson("/api/orders/{$this->order->id}/receipt-link")
            ->assertOk()
            ->assertJsonStructure(['link']);

        $this->postJson("/api/receipts/{$this->order->id}/send", [
            'channel' => 'email',
            'recipient' => 'receipt-authz@example.com',
        ])->assertCreated();
    }

    public function test_empty_perm_staff_forbidden_from_orders_stream(): void
    {
        Sanctum::actingAs($this->staffWithSlugs([], 'empty-stream@test.com'), ['staff']);

        $this->getJson('/api/stream/orders')->assertForbidden();
    }

    public function test_empty_perm_staff_forbidden_from_order_status_stream(): void
    {
        Sanctum::actingAs($this->staffWithSlugs([], 'empty-status-stream@test.com'), ['staff']);

        $this->getJson("/api/stream/orders/{$this->order->id}/status")
            ->assertForbidden();
    }

    public function test_kds_view_still_reaches_kds_stream(): void
    {
        Sanctum::actingAs(
            $this->staffWithSlugs(['kds.view'], 'kds-stream@test.com'),
            ['staff'],
        );

        $response = $this->getJson('/api/stream/kds');
        $status = method_exists($response, 'status') ? $response->status() : $response->getStatusCode();
        $this->assertNotContains($status, [401, 403], 'kds.view must still reach /stream/kds');
    }

    public function test_get_api_orders_unchanged_for_roles(): void
    {
        // Regression guard: do not put permission:orders.view on GET /api/orders.
        foreach (['owner', 'manager', 'staff'] as $slug) {
            Role::firstOrCreate(
                ['slug' => $slug],
                ['name' => ucfirst($slug), 'description' => '', 'is_active' => true],
            );
        }
        Role::firstOrCreate(
            ['slug' => 'kitchen_staff'],
            ['name' => 'Kitchen Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();

        $cases = [
            'owner' => 200,
            'manager' => 200,
            'staff' => 200,
            // kitchen_staff is staff-token capable; index allows any staff token
            // and scopes via pos.view_all_station_orders (kitchen lacks it → own sales).
            'kitchen_staff' => 200,
        ];

        foreach ($cases as $roleSlug => $expected) {
            $user = User::create([
                'name' => "Orders Index {$roleSlug}",
                'email' => "orders-index-{$roleSlug}@test.com",
                'password' => Hash::make('password'),
                'role_id' => Role::where('slug', $roleSlug)->value('id'),
                'is_active' => true,
            ]);
            Sanctum::actingAs($user, ['staff']);
            $response = $this->getJson('/api/orders');
            $this->assertSame(
                $expected,
                $response->status(),
                "GET /api/orders for role {$roleSlug}",
            );
        }

        // Empty-perm custom role: still staff token → 200 (controller scopes, no route perm).
        $empty = $this->staffWithSlugs([], 'orders-index-empty@test.com');
        Sanctum::actingAs($empty, ['staff']);
        $this->getJson('/api/orders')->assertOk();
    }
}
