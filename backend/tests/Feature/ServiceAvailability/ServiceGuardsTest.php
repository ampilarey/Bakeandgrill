<?php

declare(strict_types=1);

namespace Tests\Feature\ServiceAvailability;

use App\Domains\System\Services\ServiceAvailabilityService;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Database\Seeders\ServiceStateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Stage 3 backend enforcement tests.
 *
 * Verifies the new overlay guards:
 *  - checkout/pickup blocked with 503 SERVICE_UNAVAILABLE when
 *    online_checkout=unavailable
 *  - delivery blocked with 503 when online_delivery=unavailable
 *  - catering blocked (503 via route middleware) when catering_inquiry
 *    is off
 *  - customer_registration blocks guest-session but NOT otp/login/check
 *  - POS + webhooks unaffected
 */
class ServiceGuardsTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private Customer $customer;

    private User $staffUser;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ServiceStateSeeder::class);
        Cache::flush();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'guards-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Guards Test Item',
            'base_price' => 30.0,
            'sku' => 'GUARDS-001',
            'is_active' => true,
            'is_available' => true,
        ]);
        $this->customer = Customer::create([
            'name' => 'Guards Customer',
            'phone' => '+9607770099',
            'is_active' => true,
        ]);
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@guards-test.com',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create([
            'name' => 'Guards POS',
            'identifier' => 'GUARDS-POS-001',
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    private function disable(string $key): void
    {
        app(ServiceAvailabilityService::class)->setState($key, [
            'status' => 'unavailable',
            'public_message' => 'Maintenance in progress',
            'alternatives' => ['pickup', 'call'],
        ]);
    }

    private function postCustomerPickup(): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        return $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
    }

    private function postCustomerDelivery(): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        return $this->postJson('/api/orders/delivery', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            'delivery_address_line1' => 'Some address',
            'delivery_island' => 'male',
            'delivery_contact_name' => 'Guards Customer',
            'delivery_contact_phone' => '9607770099',
        ]);
    }

    public function test_online_checkout_disabled_blocks_customer_pickup_with_503(): void
    {
        $this->disable('online_checkout');

        $response = $this->postCustomerPickup();
        $response->assertStatus(503);
        $response->assertJson([
            'code' => 'SERVICE_UNAVAILABLE',
            'service_key' => 'online_checkout',
        ]);
        $response->assertJsonPath('alternatives', ['pickup', 'call']);
    }

    public function test_online_checkout_disabled_blocks_customer_delivery_with_503(): void
    {
        $this->disable('online_checkout');

        $response = $this->postCustomerDelivery();
        $response->assertStatus(503);
        $response->assertJson([
            'code' => 'SERVICE_UNAVAILABLE',
            'service_key' => 'online_checkout',
        ]);
    }

    public function test_online_delivery_disabled_blocks_only_delivery(): void
    {
        $this->disable('online_delivery');

        $this->postCustomerDelivery()->assertStatus(503)
            ->assertJsonPath('service_key', 'online_delivery');

        // Pickup still works
        $this->postCustomerPickup()->assertCreated();
    }

    public function test_legacy_online_gate_still_returns_422_when_overlay_available(): void
    {
        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '0',
            'type' => 'boolean',
            'group' => 'Online Ordering',
            'label' => 'Online Ordering',
            'is_public' => true,
        ]);
        Cache::forget('site_setting.online_ordering_enabled');

        // Overlay says available but the legacy gate is closed.
        $this->postCustomerPickup()->assertStatus(422);
    }

    public function test_pos_and_staff_delivery_bypass_service_overlay(): void
    {
        // Even with everything overlay-disabled, POS keeps ringing.
        $this->disable('online_checkout');
        $this->disable('online_delivery');

        $this->ensurePosApiReady($this->staffUser, 'GUARDS-POS-001');

        $this->withHeader('X-Device-Identifier', 'GUARDS-POS-001')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated();

        // Staff-authored delivery order is not gated either (staff branch bypass).
        $this->withHeader('X-Device-Identifier', 'GUARDS-POS-001')
            ->postJson('/api/orders/delivery', [
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
                'delivery_address_line1' => 'Staff phone order',
                'delivery_island' => 'male',
                'delivery_contact_name' => 'Walk-in',
                'delivery_contact_phone' => '9607770099',
                'customer_id' => $this->customer->id,
            ])
            ->assertCreated();
    }

    public function test_catering_inquiry_disabled_blocks_public_catering_form(): void
    {
        $this->disable('catering_inquiry');

        $response = $this->postJson('/api/catering-requests', [
            'contact_name' => 'Test',
            'phone' => '9607770099',
            'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_time' => '18:00',
            'guest_count' => 20,
        ]);
        $response->assertStatus(503);
        $response->assertJsonPath('service_key', 'catering_inquiry');
    }

    public function test_customer_registration_disabled_blocks_guest_session_but_not_otp(): void
    {
        $this->disable('customer_registration');

        // Guest session — blocked with 503
        $this->postJson('/api/auth/customer/guest-session', [
            'phone' => '9607770001',
            'name' => 'Guest',
        ])->assertStatus(503)->assertJsonPath('service_key', 'customer_registration');

        // OTP request — still open (route uses no service.available middleware).
        // We don't verify the OTP send here (SMS wiring), only that the endpoint
        // is not rejected with SERVICE_UNAVAILABLE.
        $response = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '9607770001',
        ]);
        $this->assertNotSame(503, $response->getStatusCode(), 'OTP request must not be gated by customer_registration');
    }

    public function test_enforcement_disabled_flag_makes_all_guards_no_ops(): void
    {
        $this->disable('online_checkout');
        config()->set('service_availability.enforcement_enabled', false);
        app(ServiceAvailabilityService::class)->bustCache();

        // Overlay is off due to global rollback flag → pickup still works
        // (legacy gate remains SSOT).
        $this->postCustomerPickup()->assertCreated();
    }

    public function test_ordering_gate_audit_written_when_admin_flips_master_switch(): void
    {
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Gate Owner',
            'email' => 'owner@guards-test.com',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $this->postJson('/api/admin/ordering/toggle', ['enabled' => false])->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ordering_gate.online_ordering_enabled.updated',
            'user_id' => $owner->id,
        ]);
    }
}
