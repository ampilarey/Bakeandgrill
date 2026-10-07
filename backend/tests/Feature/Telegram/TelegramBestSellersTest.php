<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Best sellers show each item's sizes (owner, 2026-10-07: "Why variants are
 * not showing. For example water has small and large").
 */
class TelegramBestSellersTest extends TestCase
{
    use FakesTelegram;
    use RefreshDatabase;

    public function test_best_sellers_split_by_size(): void
    {
        $this->roles();
        $this->fakeTelegram();
        $bot = $this->bot();
        $this->link($bot, $this->staff('owner', '+9607820288', 'Ahmed'), '5550001');

        $water = Item::factory()->create(['name' => 'Water']);
        $kottu = Item::factory()->create(['name' => 'Kottu']);
        $order = Order::factory()->takeaway()->create(['status' => 'completed', 'payment_status' => 'paid', 'total' => 100]);
        $line = fn (Item $i, int $q, ?string $v) => OrderItem::query()->create(['order_id' => $order->id, 'item_id' => $i->id, 'item_name' => $i->name, 'variant_name' => $v, 'quantity' => $q, 'unit_price' => 5, 'total_price' => 5 * $q]);
        $line($water, 40, 'Small');
        $line($water, 16, 'Large');
        $line($kottu, 3, null);
        $line($water, 9, 'Large')->delete(); // a removed line is not a sale

        $this->telegramText($bot, '5550001', '📊 Today')->assertOk();
        $text = $this->lastText('5550001');
        $this->assertStringContainsString('1. Water × 56 (Small 40, Large 16)', $text);
        $this->assertStringContainsString('2. Kottu × 3' . "\n", $text . "\n");
        $this->assertStringNotContainsString('Kottu × 3 (', $text);
        $this->assertStringContainsString('Best sellers', $text);

        $this->telegramText($bot, '5550001', '/week')->assertOk();
        $this->assertStringContainsString('1. Water × 56 (Small 40, Large 16)', $this->lastText('5550001'));
    }
}
