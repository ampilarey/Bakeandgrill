<?php

namespace App\Services;

use App\Models\Device;
use App\Models\Item;
use App\Models\Modifier;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemModifier;
use App\Models\Printer;
use App\Models\PrintJob;
use Illuminate\Support\Facades\DB;

class OrderCreationService
{
    public function createFromPayload(array $payload, ?object $user): Order
    {
        $device = null;
        if (!empty($payload['device_identifier'])) {
            $device = Device::where('identifier', $payload['device_identifier'])->first();
        }

        return DB::transaction(function () use ($payload, $user, $device) {
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

            $order->update([
                'subtotal' => $subtotal,
                'total' => $subtotal,
            ]);

            $order = $order->load(['items.modifiers']);
            if (!array_key_exists('print', $payload) || $payload['print'] === true) {
                $this->dispatchPrintJobs($order);
            }

            return $order;
        });
    }

    public function addItemsToOrder(Order $order, array $items, bool $print = true): Order
    {
        return DB::transaction(function () use ($order, $items, $print) {
            $additionalSubtotal = $this->addOrderItems($order, $items);
            $order->update([
                'subtotal' => ($order->subtotal ?? 0) + $additionalSubtotal,
                'total' => ($order->total ?? 0) + $additionalSubtotal,
            ]);

            $order = $order->load(['items.modifiers']);
            if ($print) {
                $this->dispatchPrintJobs($order);
            }

            return $order;
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
            // SECURITY: item_id is required, load from DB only
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
            
            // Determine price from DB (variant or base)
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

            // Create order item with DB-sourced data ONLY
            $orderItem = OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $itemModel->id,
                'variant_id' => $variantId,
                'item_name' => $itemModel->name, // From DB only
                'variant_name' => $variantName,
                'quantity' => $quantity,
                'unit_price' => $basePrice,
                'total_price' => 0, // Will update after modifiers
                'notes' => null,
                'status' => 'pending',
            ]);

            // SECURITY: Process modifiers - validate they belong to item, use DB price only
            if (!empty($itemPayload['modifiers'])) {
                $validModifierIds = $itemModel->modifiers->pluck('id')->toArray();
                
                foreach ($itemPayload['modifiers'] as $modifierPayload) {
                    $modifierId = $modifierPayload['modifier_id'];
                    
                    // Reject if modifier doesn't belong to this item
                    if (!in_array($modifierId, $validModifierIds)) {
                        throw new \InvalidArgumentException("Modifier {$modifierId} not valid for item {$itemId}");
                    }

                    $modifierModel = $itemModel->modifiers()->where('modifiers.id', $modifierId)->first();
                    
                    // SECURITY: Use DB price ONLY - never trust client
                    $modifierPrice = (float) $modifierModel->price;
                    $modifierQuantity = (int) ($modifierPayload['quantity'] ?? 1);
                    $modifierTotal += $modifierPrice * $modifierQuantity;

                    OrderItemModifier::create([
                        'order_item_id' => $orderItem->id,
                        'modifier_id' => $modifierModel->id,
                        'modifier_name' => $modifierModel->name, // From DB only
                        'modifier_price' => $modifierPrice,
                        'quantity' => $modifierQuantity,
                    ]);
                }
            }

            // Calculate final line total
            $lineTotal = ($basePrice + $modifierTotal) * $quantity;
            
            // Prevent negative or zero totals (security check)
            if ($lineTotal <= 0) {
                throw new \InvalidArgumentException("Invalid line total calculated for item {$itemId}");
            }
            
            $subtotal += $lineTotal;
            $orderItem->update(['total_price' => $lineTotal]);
        }

        return $subtotal;
    }

    /**
     * Generate thread-safe order number using daily sequence table
     */
    private function generateOrderNumber(): string
    {
        $date = now()->toDateString();
        $dateFormatted = now()->format('Ymd');

        // CONCURRENCY SAFE: Use row locking to prevent duplicate order numbers
        $sequence = DB::transaction(function () use ($date) {
            $dailySeq = DB::table('daily_sequences')
                ->where('date', $date)
                ->lockForUpdate() // Locks row for this transaction
                ->first();

            if (!$dailySeq) {
                // First order of the day
                DB::table('daily_sequences')->insert([
                    'date' => $date,
                    'last_order_number' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                return 1;
            }

            // Increment and update
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

    private function dispatchPrintJobs(Order $order): void
    {
        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['kitchen', 'bar'])
            ->get();

        if ($printers->isEmpty()) {
            return;
        }

        foreach ($printers as $printer) {
            $job = PrintJob::create([
                'order_id' => $order->id,
                'printer_id' => $printer->id,
                'type' => $printer->type,
                'status' => 'queued',
                'payload' => [
                    'printer' => [
                        'id' => $printer->id,
                        'name' => $printer->name,
                        'ip_address' => $printer->ip_address,
                        'port' => $printer->port,
                        'type' => $printer->type,
                        'station' => $printer->station,
                    ],
                    'order' => [
                        'id' => $order->id,
                        'order_number' => $order->order_number,
                        'type' => $order->type,
                        'notes' => $order->notes,
                        'created_at' => $order->created_at?->toIso8601String(),
                        'items' => $order->items->map(function ($item) {
                            return [
                                'id' => $item->id,
                                'item_name' => $item->item_name,
                                'quantity' => $item->quantity,
                                'modifiers' => $item->modifiers->map(function ($modifier) {
                                    return [
                                        'id' => $modifier->id,
                                        'modifier_name' => $modifier->modifier_name,
                                        'modifier_price' => $modifier->modifier_price,
                                    ];
                                })->values(),
                            ];
                        })->values(),
                    ],
                ],
                'attempts' => 0,
                'last_error' => null,
            ]);

            try {
                app(PrintProxyService::class)->send($job);
            } catch (\Throwable $error) {
                $job->update([
                    'status' => 'failed',
                    'attempts' => $job->attempts + 1,
                    'last_error' => $error->getMessage(),
                ]);
            }
        }
    }
}
