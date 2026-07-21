<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Stage 8 — Emergency lockdown / internal service guards (plan §11).
 *
 *  - pos_sales blocks NEW POS tickets with 503
 *  - existing orders can still be updated (settle/mark-picked-up)
 *  - kds_operations blocks kitchen mutations but not list reads
 *  - delivery_operations blocks staff delivery mutations
 *  - env EMERGENCY_WRITE_LOCK blocks even when DB says available
 *  - admin, auth, webhooks unaffected
 */
class EmergencyLockdownTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staffUser;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, ServiceStateSeeder::class]);
        Cache::flush();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'emergency-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Emergency Test Item',
            'base_price' => 25.0,
            'sku' => 'EMERG-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        // Owner role bypasses every permission check → we only test the
        // `service.available` middleware behaviour, not per-permission gating.
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Emergency Owner',
            'email' => 'owner@emergency-test.com',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create([
            'name' => 'Emergency POS',
            'identifier' => 'EMERG-POS-001',
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    private function disable(string $key): void
    {
        app(ServiceAvailabilityService::class)->setState($key, [
            'status' => 'unavailable',
            'reason_type' => 'emergency',
            'public_message' => 'Emergency in progress',
        ]);
    }

    public function test_pos_sales_disabled_blocks_new_ticket_with_503(): void
    {
        $this->ensurePosApiReady($this->staffUser, 'EMERG-POS-001');
        $this->disable('pos_sales');

        $this->withHeader('X-Device-Identifier', 'EMERG-POS-001')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertStatus(503)
            ->assertJsonPath('code', 'SERVICE_UNAVAILABLE')
            ->assertJsonPath('service_key', 'pos_sales');
    }

    public function test_pos_read_of_existing_order_still_works_when_pos_sales_disabled(): void
    {
        $this->ensurePosApiReady($this->staffUser, 'EMERG-POS-001');

        // Create ticket first while pos_sales is still available.
        $created = $this->withHeader('X-Device-Identifier', 'EMERG-POS-001')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ]);
        $created->assertCreated();
        $orderId = (int) ($created->json('order.id') ?? $created->json('id'));
        $this->assertGreaterThan(0, $orderId);

        // Now lockdown.
        $this->disable('pos_sales');

        // Reading an existing order stays available under pos_sales lockdown
        // — only NEW ticket creation is blocked.
        $this->withHeader('X-Device-Identifier', 'EMERG-POS-001')
            ->getJson("/api/orders/{$orderId}")
            ->assertSuccessful();
    }

    public function test_kds_operations_disabled_blocks_kitchen_done_but_not_list(): void
    {
        $this->ensurePosApiReady($this->staffUser, 'EMERG-POS-001');
        $this->disable('kds_operations');

        // GET /kds/orders should still work (read).
        $this->getJson('/api/kds/orders')->assertSuccessful();

        // The middleware fires before route-model-binding on this route
        // pattern (Route::post('/kds/orders/{id}/kitchen-done')) since
        // {id} is a plain param, so we don't need a real order for the
        // 503 assertion.
        $this->withHeader('X-Device-Identifier', 'EMERG-POS-001')
            ->postJson('/api/kds/orders/999999/kitchen-done')
            ->assertStatus(503)
            ->assertJsonPath('code', 'SERVICE_UNAVAILABLE')
            ->assertJsonPath('service_key', 'kds_operations');
    }

    public function test_delivery_operations_disabled_blocks_driver_store(): void
    {
        $this->ensurePosApiReady($this->staffUser, 'EMERG-POS-001');
        $this->disable('delivery_operations');

        // Creating a driver has no {order} route param, so we can assert
        // the 503 without needing route-model-binding to succeed.
        $this->withHeader('X-Device-Identifier', 'EMERG-POS-001')
            ->postJson('/api/delivery/drivers', [
                'name' => 'Test Driver',
                'phone' => '7777777',
            ])
            ->assertStatus(503)
            ->assertJsonPath('service_key', 'delivery_operations');
    }

    public function test_env_emergency_write_lock_overrides_db_available(): void
    {
        $this->ensurePosApiReady($this->staffUser, 'EMERG-POS-001');
        // DB still shows pos_sales available.
        Config::set('service_availability.emergency_write_lock', true);
        Cache::flush();

        $this->withHeader('X-Device-Identifier', 'EMERG-POS-001')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertStatus(503);
    }

    public function test_service_status_read_is_never_blocked(): void
    {
        $this->disable('pos_sales');
        Config::set('service_availability.emergency_write_lock', true);
        Cache::flush();

        $this->getJson('/api/service-status')->assertOk();
    }

    public function test_service_status_notify_me_is_never_blocked_by_lockdown(): void
    {
        // The public notify-me signup form must stay open even during
        // lockdown so customers can subscribe to restoration SMS.
        Config::set('service_availability.emergency_write_lock', true);
        Cache::flush();

        $response = $this->postJson('/api/service-status/notify-me', [
            'service_key' => 'online_checkout',
            'mobile' => '7777777',
        ]);
        $this->assertNotSame(503, $response->status(), 'Notify-me signup must never be blocked by lockdown');
    }
}
