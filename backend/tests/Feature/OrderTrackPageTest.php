<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderTrackPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_tracking_page_renders_order_without_react(): void
    {
        $item = Item::create([
            'name' => 'BML Bajiya',
            'base_price' => 1.00,
            'is_active' => true,
        ]);

        $order = Order::create([
            'order_number' => 'BG-20260522-0099',
            'tracking_token' => 'TestTrackToken123',
            'type' => 'online_pickup',
            'status' => 'in_progress',
            'payment_status' => 'paid',
            'subtotal' => 1.00,
            'tax_amount' => 0.08,
            'total' => 1.08,
            'paid_at' => now(),
        ]);

        $order->items()->create([
            'item_id' => $item->id,
            'item_name' => 'BML Bajiya',
            'quantity' => 1,
            'unit_price' => 1.00,
            'total_price' => 1.00,
        ]);

        $this->get('/order/track/TestTrackToken123')
            ->assertOk()
            ->assertSee('BG-20260522-0099')
            ->assertSee('Being prepared')
            ->assertSee('BML Bajiya')
            ->assertSee('Something wrong with this order?')
            ->assertDontSee('Page not found', false);
    }

    public function test_unknown_tracking_token_returns_friendly_404(): void
    {
        $this->get('/order/track/doesnotexist000')
            ->assertNotFound()
            ->assertSee('Order not found');
    }
}
