<?php

declare(strict_types=1);

namespace Tests\Feature\Promotions\Concerns;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;

trait BuildsPromoOrders
{
    private Category $category;

    private Item $item;

    private Customer $customer;

    private function seedCatalog(float $price = 100.0, float $cost = 40.0): void
    {
        $this->category = Category::create([
            'name' => 'Food',
            'slug' => 'food-strategy-' . uniqid(),
            'is_active' => true,
        ]);
        $this->item = Item::create([
            'category_id' => $this->category->id,
            'name' => 'Strategy Item',
            'base_price' => $price,
            'cost' => $cost,
            'sku' => 'STR-' . uniqid(),
            'barcode' => 'STR-' . uniqid(),
            'is_active' => true,
            'is_available' => true,
        ]);
        $this->customer = Customer::create([
            'name' => 'Strategy Customer',
            'phone' => '+9607' . random_int(100000, 999999),
            'loyalty_points' => 0,
            'tier' => 'bronze',
            'is_active' => true,
        ]);
    }

    /** @param array<string, mixed> $attrs */
    private function makePromo(array $attrs = []): Promotion
    {
        return Promotion::create(array_merge([
            'name' => 'Strategy Promo',
            'code' => 'STR' . strtoupper(substr(uniqid(), -6)),
            'type' => 'percentage',
            'discount_value' => 10,
            'is_active' => true,
            'stackable' => false,
            'scope' => 'order',
            'auto_apply' => false,
        ], $attrs));
    }

    private function buildPromoOrder(
        float $lineTotal = 100.0,
        int $qty = 1,
        ?Item $item = null,
        string $type = 'takeaway',
        ?int $customerId = null,
    ): Order {
        $item ??= $this->item;
        $unit = $lineTotal / max(1, $qty);
        $order = Order::create([
            'order_number' => 'S' . random_int(10000, 99999),
            'type' => $type,
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'customer_id' => $customerId ?? $this->customer->id,
            'subtotal' => $lineTotal,
            'subtotal_laar' => (int) round($lineTotal * 100),
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => $lineTotal,
            'total_laar' => (int) round($lineTotal * 100),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'quantity' => $qty,
            'unit_price' => $unit,
            'total_price' => $lineTotal,
        ]);

        return $order->fresh(['items.item']);
    }
}
