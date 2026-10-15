<?php

declare(strict_types=1);

namespace Tests\Feature\Receipts;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-15: BG-20261015-0023 charged a 10.00 packaging fee that sat
 * in the total but on no line, so Subtotal + GST did not add up. Every receipt
 * and bill now shows the fee between Subtotal and GST, and each item's share.
 */
class ReceiptFeeLinesTest extends TestCase
{
    use RefreshDatabase;

    private function order(): Order
    {
        $order = Order::factory()->create([
            'type' => 'takeaway',
            'status' => 'completed',
            'payment_status' => 'paid',
            'subtotal' => 320,
            'tax_amount' => 0.80,
            'packaging_fee_laar' => 1000,
            'total' => 330.80,
            'total_laar' => 33080,
            'user_id' => User::factory()->create()->id,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => Item::factory()->create()->id,
            'item_name' => 'Momo Set',
            'quantity' => 2,
            'unit_price' => 160,
            'total_price' => 320,
            'packaging_fee' => 5,
            'packaging_fee_mode' => 'per_unit',
        ]);

        return $order;
    }

    public function test_the_receipt_page_and_pdf_show_the_packaging_fee_and_the_items_share(): void
    {
        $order = $this->order();
        $receipt = Receipt::create(['order_id' => $order->id, 'channel' => 'sms', 'recipient' => '7771234']);

        $html = $this->get("/receipts/{$receipt->token}")->assertOk()->getContent();
        $this->assertMatchesRegularExpression('/Packaging fee<\/span><span>MVR 10\.00/', $html);
        $this->assertStringContainsString('+ Packaging fee · 5.00 × 2 = 10.00', $html);
        $this->assertLessThan(strpos($html, '<span>GST</span>'), strpos($html, 'Packaging fee</span>'));
    }

    public function test_the_tills_receipts_list_carries_the_fee_lines_and_item_notes(): void
    {
        $order = $this->order();
        PermissionCatalogSync::sync();
        $cashier = $this->makeStaff('staff', ['name' => 'Hassan']);
        $device = Device::create(['name' => 'Front till', 'identifier' => 'pos-fee-test', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        // A cashier's receipts are their open shift's.
        $shift = Shift::create([
            'user_id' => $cashier->id,
            'device_id' => $device->id,
            'opened_at' => now()->subHour(),
            'opening_cash' => 100,
        ]);
        $order->update(['shift_id' => $shift->id, 'user_id' => $cashier->id]);
        Sanctum::actingAs($cashier, ['staff']);

        $row = collect($this->getJson('/api/orders?per_page=10')->assertOk()->json('data'))->firstWhere('id', $order->id);
        $this->assertNotNull($row);
        $this->assertSame([['label' => 'Packaging fee', 'amount' => 10]], $row['fee_lines']);
        $this->assertSame('Packaging fee · 5.00 × 2 = 10.00', $row['items'][0]['packaging_note']);
    }

    public function test_the_bill_link_shows_the_packaging_fee(): void
    {
        $order = $this->order();
        $order->update(['status' => 'pending', 'payment_status' => 'unpaid']);
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeStaff('owner'), ['staff']);

        $link = $this->postJson("/api/orders/{$order->id}/send-bill")->assertOk()->json('link');
        $html = $this->get(parse_url($link, PHP_URL_PATH))->assertOk()->getContent();
        $this->assertMatchesRegularExpression('/Packaging fee<\/span><span>MVR 10\.00/', $html);
        $this->assertStringContainsString('+ Packaging fee · 5.00 × 2 = 10.00', $html);
    }

    public function test_a_dine_in_order_shows_no_packaging(): void
    {
        $order = $this->order();
        $order->update(['type' => 'dine_in', 'packaging_fee_laar' => 0]);
        $receipt = Receipt::create(['order_id' => $order->id, 'channel' => 'sms', 'recipient' => '7771234']);

        $html = $this->get("/receipts/{$receipt->token}")->assertOk()->getContent();
        $this->assertStringNotContainsString('Packaging fee', $html);
    }
}
