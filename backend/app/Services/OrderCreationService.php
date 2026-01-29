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
            $itemModel = null;
            if (!empty($itemPayload['item_id'])) {
                $itemModel = Item::find($itemPayload['item_id']);
            }

            $basePrice = $itemModel?->base_price ?? 0;
            $quantity = (int) $itemPayload['quantity'];
            $modifierTotal = 0;

            $orderItem = OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $itemModel?->id,
                'variant_id' => null,
                'item_name' => $itemModel?->name ?? $itemPayload['name'],
                'variant_name' => null,
                'quantity' => $quantity,
                'unit_price' => $basePrice,
                'total_price' => 0,
                'notes' => null,
                'status' => 'pending',
            ]);

            if (!empty($itemPayload['modifiers'])) {
                foreach ($itemPayload['modifiers'] as $modifierPayload) {
                    $modifierModel = null;
                    if (!empty($modifierPayload['modifier_id'])) {
                        $modifierModel = Modifier::find($modifierPayload['modifier_id']);
                    }

                    $modifierPrice = $modifierModel?->price ?? (float) $modifierPayload['price'];
                    $modifierTotal += $modifierPrice;

                    OrderItemModifier::create([
                        'order_item_id' => $orderItem->id,
                        'modifier_id' => $modifierModel?->id,
                        'modifier_name' => $modifierModel?->name ?? $modifierPayload['name'],
                        'modifier_price' => $modifierPrice,
                        'quantity' => 1,
                    ]);
                }
            }

            $lineTotal = ($basePrice + $modifierTotal) * $quantity;
            $subtotal += $lineTotal;

            $orderItem->update(['total_price' => $lineTotal]);
        }

        return $subtotal;
    }

    private function generateOrderNumber(): string
    {
        $date = now()->format('Ymd');
        $count = Order::whereDate('created_at', now()->toDateString())->count() + 1;
        $sequence = str_pad((string) $count, 4, '0', STR_PAD_LEFT);

        return "BG-{$date}-{$sequence}";
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
