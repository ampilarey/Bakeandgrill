<?php

declare(strict_types=1);

namespace Tests\Feature\Stream;

use App\Domains\Realtime\Services\OrderStreamProvider;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-10-29: Admin → Orders "flicks, content appears and disappears quickly". The
 * stream's cursor came back as a UTC time while the orders are stored in Maldives time, five
 * hours ahead, so every poll sent the last five hours of orders again and the page reloaded
 * every second.
 */
class OrderStreamCursorTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_order_already_sent_is_not_sent_again(): void
    {
        $this->assertSame('Indian/Maldives', config('app.timezone'));
        $order = Order::factory()->create();
        $order->forceFill(['updated_at' => now()->subMinutes(10)])->saveQuietly();

        $provider = app(OrderStreamProvider::class);
        $first = $provider->fetchSince(now()->subHour()->toIso8601String());
        $this->assertCount(1, $first);

        $this->assertSame([], $provider->fetchSince($first[0]->id), 'the cursor of the last event must not send it again');
    }

    public function test_a_change_after_the_cursor_is_sent_once(): void
    {
        $provider = app(OrderStreamProvider::class);
        $a = Order::factory()->create();
        $a->forceFill(['updated_at' => now()->subMinutes(3)])->saveQuietly();
        $cursor = $provider->fetchSince(now()->subHour()->toIso8601String())[0]->id;

        $b = Order::factory()->create();
        $b->forceFill(['updated_at' => now()->subMinute()])->saveQuietly();

        $next = $provider->fetchSince($cursor);
        $this->assertCount(1, $next);
        $this->assertSame([], $provider->fetchSince($next[0]->id));
    }
}
