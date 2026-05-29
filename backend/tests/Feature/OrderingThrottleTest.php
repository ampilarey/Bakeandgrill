<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderingThrottleTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'throttle-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Throttle Item',
            'base_price' => 25.0,
            'sku' => 'TH-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Throttle Customer',
            'phone' => '+9607770100',
            'is_active' => true,
        ]);

        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '1',
            'type' => 'boolean',
            'group' => 'Online Ordering',
            'label' => 'Enabled',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'ordering_max_per_15min'], [
            'value' => '2',
            'type' => 'text',
            'group' => 'Ordering',
            'label' => 'Max per 15 min',
            'is_public' => false,
        ]);
        SiteSetting::bust();
        Cache::flush();
    }

    private function postCustomerOrder(): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($this->customer, ['customer']);

        return $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
    }

    public function test_online_orders_are_throttled_when_max_per_15min_exceeded(): void
    {
        Order::factory()->count(2)->create([
            'type' => 'online_pickup',
            'created_at' => now()->subMinutes(5),
        ]);

        $this->postCustomerOrder()->assertStatus(429);
    }

    public function test_throttle_allows_orders_when_limit_is_zero(): void
    {
        SiteSetting::set('ordering_max_per_15min', '0');
        SiteSetting::bust();

        Order::factory()->count(5)->create([
            'type' => 'online_pickup',
            'created_at' => now()->subMinutes(2),
        ]);

        $this->postCustomerOrder()->assertCreated();
    }

    public function test_old_orders_outside_window_do_not_count_toward_throttle(): void
    {
        Order::factory()->count(3)->create([
            'type' => 'online_pickup',
            'created_at' => now()->subMinutes(20),
        ]);

        $this->postCustomerOrder()->assertCreated();
    }
}
