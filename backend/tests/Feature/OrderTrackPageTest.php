<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Order;
use App\Support\OrderTrackingUrl;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * SMS track links must hit the order SPA (not a separate Blade page).
 * React OrderStatusPage loads details via GET /api/orders/track/{token}.
 */
class OrderTrackPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_tracking_url_points_at_order_spa_path_token(): void
    {
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

        $url = OrderTrackingUrl::for($order);

        $this->assertStringEndsWith('/order/track/TestTrackToken123', $url);
        $this->assertStringNotContainsString('?tok=', $url);
    }

    public function test_tracking_path_serves_order_spa_shell(): void
    {
        $path = public_path('order/index.html');
        if (!is_file($path)) {
            $this->markTestSkipped('Order app not deployed to public/order.');
        }

        $this->get('/order/track/TestTrackToken123')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/html; charset=utf-8')
            ->assertSee('id="root"', false)
            ->assertDontSee('Something wrong with this order?', false);
    }

    public function test_short_track_link_redirects_to_spa_track_path(): void
    {
        $this->get('/t/TestTrackToken123')
            ->assertRedirect('/order/track/TestTrackToken123');
    }

    public function test_unknown_token_still_serves_spa_shell_for_client_error(): void
    {
        $path = public_path('order/index.html');
        if (!is_file($path)) {
            $this->markTestSkipped('Order app not deployed to public/order.');
        }

        // Invalid tokens are handled in the SPA after the public track API 404s.
        $this->get('/order/track/doesnotexist000')
            ->assertOk()
            ->assertSee('id="root"', false);
    }
}
