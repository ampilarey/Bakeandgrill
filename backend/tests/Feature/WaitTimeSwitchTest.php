<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-12: "I want to make off that from the admin, maybe later
 * turn on" — the order app's "~N min wait" pill follows a switch on Admin →
 * Settings → Ordering → Features, off by default.
 */
class WaitTimeSwitchTest extends TestCase
{
    use RefreshDatabase;

    private function openTicket(): void
    {
        $item = $this->makeItem(false, 0, ['base_price' => 10, 'prep_time_minutes' => 20]);
        $order = Order::create([
            'order_number' => 'BG-T-1', 'type' => 'online_pickup', 'status' => 'paid',
            'subtotal' => 10, 'tax_amount' => 0, 'total' => 10,
        ]);
        $order->items()->create([
            'item_id' => $item->id, 'item_name' => $item->name, 'quantity' => 1,
            'unit_price' => 10, 'total_price' => 10, 'status' => 'pending',
        ]);
    }

    public function test_the_wait_time_is_hidden_until_switched_on(): void
    {
        $this->openTicket();

        // Off by default: the app sees an empty queue and shows nothing.
        $this->getJson('/api/wait-time')->assertOk()
            ->assertJson(['enabled' => false, 'queue_depth' => 0, 'wait_minutes' => 0]);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/site-settings', ['settings' => ['order_app_wait_time_enabled' => '1']])->assertOk();

        $res = $this->getJson('/api/wait-time')->assertOk()->assertJson(['enabled' => true, 'queue_depth' => 1]);
        $this->assertSame(10, $res->json('wait_minutes'), '20 minutes of prep over two parallel tickets');

        SiteSetting::set('order_app_wait_time_enabled', '0');
        $this->getJson('/api/wait-time')->assertOk()->assertJson(['enabled' => false, 'queue_depth' => 0]);
    }
}
