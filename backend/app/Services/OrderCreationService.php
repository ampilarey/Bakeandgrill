<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Orders\Events\OrderCreated;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemModifier;
use Illuminate\Support\Facades\DB;

class OrderCreationService
{
    public function createFromPayload(array $payload, ?object $user): Order
    {
        $device = null;
        if (!empty($payload['device_identifier'])) {
            $device = Device::where('identifier', $payload['device_identifier'])->first();
        }

        $printKitchen = !array_key_exists('print', $payload) || $payload['print'] === true;

        return DB::transaction(function () use ($payload, $user, $device, $printKitchen): Order {
            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'type' => $payload['type'],
                'status' => 'pending',
                'restaurant_table_id' => $payload['restaurant_table_id'] ?? null,
                'customer_id' => $payload['customer_id'] ?? null,
                'user_id' => $user?->id,
                'device_id' => $device?->id,
                'subtotal' => 0,
                'tax_amount' => 0,
                'discount_amount' => 0,
                'total' => 0,
                'notes' => $payload['notes'] ?? null,
                'customer_notes' => $payload['customer_notes'] ?? null,
            ]);

            $subtotal = $this->addOrderItems($order, $payload['items'] ?? []);

            $order->load(['items.item']);
            $taxAmount = 0;
            foreach ($order->items as $orderItem) {
                $item = $orderItem->item;
                if ($item && $orderItem->total_price > 0) {
                    $rate = (float) ($item->tax_rate ?? 0);
                    $taxAmount += $orderItem->total_price * ($rate / 100);
                }
            }

            $discountAmount = (float) ($payload['discount_amount'] ?? 0);
            $discountAmount = max(0, min($discountAmount, $subtotal));
            $total = max(0, $subtotal + $taxAmount - $discountAmount);

            $order->update([
                'subtotal' => $subtotal,
                'tax_amount' => round($taxAmount, 2),
                'discount_amount' => round($discountAmount, 2),
                'total' => round($total, 2),
            ]);

            $order->load(['items.modifiers']);

            DB::afterCommit(function () use ($order, $printKitchen): void {
                OrderCreated::dispatch($order->fresh(['items.modifiers']), $printKitchen);
            });

            return $order;
        });
    }

    public function addItemsToOrder(Order $order, array $items, bool $print = true): Order
    {
        return DB::transaction(function () use ($order, $items): Order {
            $additionalSubtotal = $this->addOrderItems($order, $items);
            $order->update([
                'subtotal' => ($order->subtotal ?? 0) + $additionalSubtotal,
                'total' => ($order->total ?? 0) + $additionalSubtotal,
            ]);

            return $order->load(['items.modifiers']);
        });
    }

    public function recalculateTotals(Order $order): Order
    {
        $subtotal = $order->items()->sum('total_price');
        $order->update([
            'subtotal' => $subtotal,
            'total' => $subtotal,
        ]);

        return $order->load(['items.modifiers']);
    }

    private function addOrderItems(Order $order, array $items): float
    {
        $subtotal = 0;

        foreach ($items as $itemPayload) {
            $itemId = $itemPayload['item_id'];
            $itemModel = Item::with(['variants', 'modifiers'])
                ->where('id', $itemId)
                ->where('is_active', true)
                ->where('is_available', true)
                ->first();

            if (!$itemModel) {
                throw new \InvalidArgumentException("Item {$itemId} not found or unavailable");
            }

            $quantity = (int) $itemPayload['quantity'];

            if ($itemModel->track_stock && $itemModel->availability_type === 'stock_based') {
                $stockOk = app(StockManagementService::class)->checkStock($itemModel, $quantity);
                if (!$stockOk) {
                    throw new \InvalidArgumentException(
                        "Insufficient stock for {$itemModel->name}. Available: {$itemModel->stock_quantity}, requested: {$quantity}",
                    );
                }
            }

            $variantId = $itemPayload['variant_id'] ?? null;
            if ($variantId) {
                $variant = $itemModel->variants()->where('id', $variantId)->first();
                if (!$variant) {
                    throw new \InvalidArgumentException("Variant {$variantId} not found for item {$itemId}");
                }
                $basePrice = (float) $variant->price;
                $variantName = $variant->name;
            } else {
                $basePrice = (float) $itemModel->base_price;
                $variantName = null;
            }

            $modifierTotal = 0;

            $orderItem = OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $itemModel->id,
                'variant_id' => $variantId,
                'item_name' => $itemModel->name,
                'variant_name' => $variantName,
                'quantity' => $quantity,
                'unit_price' => $basePrice,
                'total_price' => 0,
                'notes' => null,
                'status' => 'pending',
            ]);

            if (!empty($itemPayload['modifiers'])) {
                $validModifierIds = $itemModel->modifiers->pluck('id')->toArray();

                foreach ($itemPayload['modifiers'] as $modifierPayload) {
                    $modifierId = $modifierPayload['modifier_id'];

                    if (!in_array($modifierId, $validModifierIds)) {
                        throw new \InvalidArgumentException("Modifier {$modifierId} not valid for item {$itemId}");
                    }

                    $modifierModel = $itemModel->modifiers()->where('modifiers.id', $modifierId)->first();
                    $modifierPrice = (float) $modifierModel->price;
                    $modifierQuantity = (int) ($modifierPayload['quantity'] ?? 1);
                    $modifierTotal += $modifierPrice * $modifierQuantity;

                    OrderItemModifier::create([
                        'order_item_id' => $orderItem->id,
                        'modifier_id' => $modifierModel->id,
                        'modifier_name' => $modifierModel->name,
                        'modifier_price' => $modifierPrice,
                        'quantity' => $modifierQuantity,
                    ]);
                }
            }

            $lineTotal = ($basePrice + $modifierTotal) * $quantity;

            if ($lineTotal <= 0) {
                throw new \InvalidArgumentException("Invalid line total calculated for item {$itemId}");
            }

            $subtotal += $lineTotal;
            $orderItem->update(['total_price' => $lineTotal]);
        }

        return $subtotal;
    }

    private function generateOrderNumber(): string
    {
        $date = now()->toDateString();
        $dateFormatted = now()->format('Ymd');

        $sequence = DB::transaction(function () use ($date): int {
            $dailySeq = DB::table('daily_sequences')
                ->where('date', $date)
                ->lockForUpdate()
                ->first();

            if (!$dailySeq) {
                DB::table('daily_sequences')->insert([
                    'date' => $date,
                    'last_order_number' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return 1;
            }

            $nextNumber = $dailySeq->last_order_number + 1;
            DB::table('daily_sequences')
                ->where('date', $date)
                ->update([
                    'last_order_number' => $nextNumber,
                    'updated_at' => now(),
                ]);

            return $nextNumber;
        });

        $sequenceStr = str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);

        return "BG-{$dateFormatted}-{$sequenceStr}";
    }
}
