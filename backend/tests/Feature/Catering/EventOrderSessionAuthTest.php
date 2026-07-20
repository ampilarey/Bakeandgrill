<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Models\Item;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EventOrderSessionAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_session_alone_can_create_event_order(): void
    {
        SiteSetting::set('catering_min_lead_hours', '24');
        $customer = $this->makeCustomer([
            'phone' => '+9607820288',
            'name' => 'Session User',
            'is_active' => true,
        ]);
        $item = Item::factory()->create([
            'name' => 'Party Tray',
            'base_price' => 33.00,
            'is_active' => true,
            'has_variants' => false,
        ]);

        $this->actingAs($customer, 'customer');

        $this->getJson('/api/customer/me')->assertOk();
        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Session User',
            'phone' => '7820288',
            'event_date' => now()->addDays(4)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $item->id, 'quantity' => 2]],
        ])->assertCreated();
    }

    public function test_customer_session_wins_over_concurrent_staff_web_session(): void
    {
        SiteSetting::set('catering_min_lead_hours', '24');
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner', 'is_active' => true],
        );
        $staff = User::create([
            'name' => 'Staff',
            'email' => 'staff-shadow@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        $customer = $this->makeCustomer([
            'phone' => '+9607820288',
            'name' => 'Customer',
            'is_active' => true,
        ]);
        $item = Item::factory()->create(['name' => 'Tray', 'base_price' => 10, 'is_active' => true]);

        // Both sessions active — Sanctum checks web before customer.
        $this->actingAs($staff, 'web');
        $this->actingAs($customer, 'customer');

        $this->getJson('/api/auth/customer/check')
            ->assertOk()
            ->assertJsonPath('authenticated', true);

        // /me must work so the wizard can prefill mobile (TransientToken on session customer).
        $this->getJson('/api/customer/me')
            ->assertOk()
            ->assertJsonPath('customer.phone', '+9607820288');

        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Customer',
            'phone' => '7820288',
            'event_date' => now()->addDays(4)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $item->id, 'quantity' => 1]],
        ])
            ->assertCreated()
            ->assertJsonPath('request.lines.0.name', 'Tray');
    }

    public function test_staff_bearer_still_blocked_on_event_orders(): void
    {
        SiteSetting::set('catering_min_lead_hours', '24');
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => 'Owner', 'is_active' => true],
        );
        $staff = User::create([
            'name' => 'Staff',
            'email' => 'staff-bearer@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        $item = Item::factory()->create(['name' => 'Tray', 'base_price' => 10, 'is_active' => true]);

        Sanctum::actingAs($staff, ['staff']);

        $this->postJson('/api/customer/event-orders', [
            'contact_name' => 'Nope',
            'phone' => '7000000',
            'event_date' => now()->addDays(4)->toDateString(),
            'fulfillment_time' => '12:00',
            'fulfillment_method' => 'pickup',
            'lines' => [['item_id' => $item->id, 'quantity' => 1]],
        ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden — customer access only.');
    }
}
