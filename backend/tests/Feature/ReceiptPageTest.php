<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Receipt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReceiptPageTest extends TestCase
{
    use RefreshDatabase;

    private function seedOrder(array $overrides = []): Receipt
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food', 'is_active' => true]);
        $item = Item::create([
            'name' => 'Bajiya',
            'category_id' => $category->id,
            'base_price' => 1.00,
            'base_price' => 1.00,
            'cost' => 0.50,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
        ]);

        $order = Order::create(array_merge([
            'order_number' => 'BG-20260527-0002',
            'type' => 'delivery',
            'status' => 'pending',
            'subtotal' => 1.00,
            'tax_amount' => 0.08,
            'discount_amount' => 0,
            'total' => 21.08,
            'delivery_fee' => 20.00,
            'delivery_address_line1' => 'Test address',
            'delivery_island' => 'Male',
            'delivery_contact_name' => 'Akuru',
            'delivery_contact_phone' => '+9607972434',
        ], $overrides));

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => 1,
            'unit_price' => 1.00,
            'total_price' => 1.00,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => '+9607972434',
        ]);
    }

    public function test_receipt_page_renders_for_delivery_order(): void
    {
        $receipt = $this->seedOrder();

        $this->get('/receipts/' . $receipt->token)
            ->assertOk()
            ->assertSee('BG-20260527-0002')
            ->assertSee('Delivery')
            ->assertSee('Delivery fee')
            ->assertSee('Something wrong with this receipt?')
            ->assertSee('data-complaint-send', false);
    }

    public function test_pay_page_renders_for_unpaid_delivery_order(): void
    {
        $receipt = $this->seedOrder();

        $this->get('/pay/' . $receipt->token)
            ->assertOk()
            ->assertSee('Payment')
            ->assertSee('Pay now')
            ->assertSee('Delivery fee')
            ->assertSee('doc-card-body', false)
            ->assertSee('doc-table-scroll', false);
    }

    public function test_paid_receipt_page_shows_payment_confirmed_banner(): void
    {
        $receipt = $this->seedOrder([
            'status' => 'paid',
            'paid_at' => now(),
        ]);

        $this->get('/receipts/' . $receipt->token)
            ->assertOk()
            ->assertSee('Payment confirmed')
            ->assertSee('Something wrong with this receipt?')
            ->assertSee('doc-card-body', false)
            ->assertSee('doc-masthead', false);
    }

    public function test_prepaid_dine_in_receipt_shows_prepaid_online_not_final_paid(): void
    {
        $receipt = $this->seedOrder([
            'order_number' => 'BG-20260527-DINE',
            'type' => 'dine_in',
            'status' => 'pending',
            'payment_status' => 'paid',
            'user_id' => null,
            'paid_at' => now(),
            'delivery_fee' => 0,
            'total' => 1.00,
        ]);

        \App\Models\Payment::create([
            'order_id' => $receipt->order_id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 1.00,
            'amount_laar' => 100,
            'status' => 'confirmed',
            'processed_at' => now(),
        ]);

        $this->get('/receipts/' . $receipt->token)
            ->assertOk()
            ->assertSee('Prepaid online')
            ->assertSee('dine-in visit is finished')
            ->assertDontSee('Payment confirmed')
            ->assertSee('Something wrong with this receipt?');
    }
}
