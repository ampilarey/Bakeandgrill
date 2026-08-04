<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Paired regression: while the online ordering gate is closed, the public
 * menu stays browsable (available_now true) but customer order create still
 * fails with 422. These two assertions live together so they cannot drift.
 */
class BrowseWhileOrderingClosedTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Browse Closed Cat',
            'slug' => 'browse-closed-cat',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Browse Closed Item',
            'base_price' => 40.0,
            'sku' => 'BROWSE-CLOSED-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Browse Closed Customer',
            'phone' => '+9607770088',
            'is_active' => true,
        ]);

        SiteSetting::updateOrCreate(['key' => 'online_ordering_enabled'], [
            'value' => '0',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_enabled',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'online_ordering_closed_message'], [
            'value' => 'Closed for browsing test.',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_closed_message',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'online_ordering_schedule'], [
            'value' => null,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_schedule',
            'is_public' => true,
        ]);
        SiteSetting::updateOrCreate(['key' => 'online_ordering_override_until'], [
            'value' => null,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => 'online_ordering_override_until',
            'is_public' => true,
        ]);
        Cache::forget('site_setting.online_ordering_enabled');
        Cache::forget('site_setting.online_ordering_closed_message');
        Cache::forget('site_setting.online_ordering_schedule');
        Cache::forget('site_setting.online_ordering_override_until');
    }

    public function test_menu_browsable_but_customer_order_blocked_while_gate_closed(): void
    {
        $list = $this->getJson('/api/items?channel=online_pickup');
        $list->assertOk();
        $rows = $list->json('data');
        $this->assertIsArray($rows);
        $this->assertNotEmpty($rows);

        $match = collect($rows)->firstWhere('id', $this->item->id);
        $this->assertNotNull($match, 'Seeded item must appear in public menu while gate is closed');
        $this->assertTrue(
            (bool) ($match['available_now'] ?? false),
            'available_now must stay true so the order app leaves cards clickable',
        );
        $this->assertNotSame('ordering_closed', $match['unavailable_reason'] ?? null);

        // Same channel the dine-in QR menu uses — must also stay browsable.
        $dineInList = $this->getJson('/api/items?channel=online_pickup');
        $dineInList->assertOk();
        $dineInMatch = collect($dineInList->json('data'))->firstWhere('id', $this->item->id);
        $this->assertTrue((bool) ($dineInMatch['available_now'] ?? false));

        Sanctum::actingAs($this->customer, ['customer']);
        $order = $this->postJson('/api/customer/orders', [
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
        $order->assertStatus(422);
        $this->assertStringContainsString('Closed', (string) $order->json('message'));
    }
}
