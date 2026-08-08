<?php

declare(strict_types=1);

namespace Tests\Feature\Security;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\DeliveryDriver;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Deactivated staff/driver tokens must be rejected immediately on every
 * route that accepts those token types (including shared dual-purpose routes).
 * Uses real persisted Bearer tokens — not only Sanctum::actingAs.
 */
class InactiveTokenRejectionTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private User $staff;

    private string $staffToken;

    private DeliveryDriver $driver;

    private string $driverToken;

    private Item $item;

    private Order $deliveryOrder;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-inactive-token', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Token Test Burger',
            'category_id' => $category->id,
            'base_price' => 40.00,
            'cost' => 8.00,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
        ]);

        $staffRoleId = (int) Role::where('slug', 'staff')->value('id');
        $this->staff = User::create([
            'name' => 'Active Staff',
            'email' => 'active-staff-token@test.local',
            'password' => Hash::make('password'),
            'role_id' => $staffRoleId,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staffToken = $this->staff->createToken('staff-pat', ['staff'])->plainTextToken;

        $this->driver = DeliveryDriver::create([
            'name' => 'Active Driver',
            'phone' => '+9607900001',
            'is_active' => true,
            'pin' => Hash::make('1234'),
            'vehicle_type' => 'scooter',
        ]);
        $this->driverToken = $this->driver->createToken('driver-pat', ['driver'])->plainTextToken;

        $customer = Customer::create([
            'name' => 'Loc Customer',
            'phone' => '+9607900099',
            'is_active' => true,
        ]);

        $this->deliveryOrder = Order::factory()->delivery()->create([
            'status' => 'on_the_way',
            'payment_status' => 'paid',
            'customer_id' => $customer->id,
            'delivery_driver_id' => $this->driver->id,
        ]);
    }

    private function bearer(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }

    /** Clear sticky Auth between requests so Bearer resolution is re-evaluated. */
    private function forgetAuth(): void
    {
        $this->app['auth']->forgetGuards();
    }

    public function test_driver_token_works_before_deactivation(): void
    {
        $this->getJson('/api/driver/me', $this->bearer($this->driverToken))
            ->assertOk()
            ->assertJsonPath('driver.id', $this->driver->id);
    }

    public function test_driver_token_rejected_after_deactivation(): void
    {
        $this->getJson('/api/driver/me', $this->bearer($this->driverToken))->assertOk();

        // Middleware must 403 while the Bearer PAT still exists.
        $this->driver->update(['is_active' => false]);
        $this->forgetAuth();
        $this->getJson('/api/driver/me', $this->bearer($this->driverToken))
            ->assertForbidden();

        // Admin deactivate path must also revoke all tokens immediately.
        $this->driver->update(['is_active' => true]);
        $this->driver->tokens()->delete();
        $freshToken = $this->driver->createToken('driver-pat-2', ['driver'])->plainTextToken;
        $owner = $this->makeOwner();
        $this->forgetAuth();
        $this->patchJson(
            "/api/delivery/drivers/{$this->driver->id}",
            ['is_active' => false],
            $this->staffHeaders($owner),
        )->assertOk();

        $this->assertSame(0, $this->driver->tokens()->count());
        $this->forgetAuth();
        $this->getJson('/api/driver/me', $this->bearer($freshToken))
            ->assertUnauthorized();
    }

    public function test_driver_token_rejected_after_pin_reset(): void
    {
        $this->getJson('/api/driver/me', $this->bearer($this->driverToken))->assertOk();

        $owner = $this->makeOwner();
        $this->forgetAuth();
        $this->patchJson(
            "/api/delivery/drivers/{$this->driver->id}",
            ['pin' => '9999'],
            $this->staffHeaders($owner),
        )->assertOk();

        // PIN reset revokes all tokens — stale Bearer can no longer authenticate.
        $this->assertSame(0, $this->driver->tokens()->count());
        $this->forgetAuth();
        $this->getJson('/api/driver/me', $this->bearer($this->driverToken))
            ->assertUnauthorized();
    }

    public function test_disabled_driver_cannot_access_delivery_actions(): void
    {
        // Keep the Bearer string, deactivate via model (simulates stale token if revoke missed).
        $this->driver->update(['is_active' => false]);
        $this->forgetAuth();

        $headers = $this->bearer($this->driverToken);

        $this->getJson("/api/driver/deliveries/{$this->deliveryOrder->id}", $headers)
            ->assertForbidden();

        $this->patchJson(
            "/api/driver/deliveries/{$this->deliveryOrder->id}/status",
            ['status' => 'delivered'],
            $headers,
        )->assertForbidden();

        Storage::fake('public');
        $this->post(
            "/api/driver/deliveries/{$this->deliveryOrder->id}/proof",
            ['photo' => UploadedFile::fake()->image('proof.jpg')],
            $headers,
        )->assertForbidden();

        $this->postJson('/api/driver/location', [
            'locations' => [[
                'latitude' => 4.17,
                'longitude' => 73.50,
                'recorded_at' => now()->toIso8601String(),
            ]],
        ], $headers)->assertForbidden();
    }

    public function test_disabled_staff_token_blocked_on_normal_staff_route(): void
    {
        $this->getJson('/api/auth/me', $this->bearer($this->staffToken))->assertOk();

        $this->staff->update(['is_active' => false]);
        $this->forgetAuth();

        $this->getJson('/api/auth/me', $this->bearer($this->staffToken))
            ->assertForbidden();
    }

    public function test_disabled_staff_token_blocked_on_shared_staff_customer_routes(): void
    {
        $this->staff->update(['is_active' => false]);
        $this->forgetAuth();
        $headers = $this->bearer($this->staffToken);

        $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'delivery_address_line1' => '123 Main Street',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Ali',
            'delivery_contact_phone' => '+9607820288',
        ], $headers)->assertForbidden();

        $this->postJson("/api/orders/{$this->deliveryOrder->id}/apply-promo", [
            'code' => 'ANYCODE',
        ], $headers)->assertForbidden();

        $this->deleteJson(
            "/api/orders/{$this->deliveryOrder->id}/promo/1",
            [],
            $headers,
        )->assertForbidden();

        $this->postJson('/api/stripe/intent', [
            'order_id' => $this->deliveryOrder->id,
        ], $headers)->assertForbidden();
    }

    public function test_inactive_staff_and_driver_cannot_read_shared_driver_location(): void
    {
        $path = "/api/driver/deliveries/{$this->deliveryOrder->id}/location";

        $this->staff->update(['is_active' => false]);
        $this->forgetAuth();
        $this->getJson($path, $this->bearer($this->staffToken))->assertForbidden();

        $this->driver->update(['is_active' => false]);
        $this->forgetAuth();
        $this->getJson($path, $this->bearer($this->driverToken))->assertForbidden();
    }
}
