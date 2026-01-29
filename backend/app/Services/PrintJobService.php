<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;

class PrintJobService
{
    public function dispatchKitchen(Order $order): void
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

            $this->sendJob($job);
        }
    }

    public function dispatchReceipt(Order $order): void
    {
        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['receipt', 'counter'])
            ->get();

        if ($printers->isEmpty()) {
            return;
        }

        foreach ($printers as $printer) {
            $job = PrintJob::create([
                'order_id' => $order->id,
                'printer_id' => $printer->id,
                'type' => 'receipt',
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
                        'subtotal' => $order->subtotal,
                        'tax_amount' => $order->tax_amount,
                        'discount_amount' => $order->discount_amount,
                        'total' => $order->total,
                        'created_at' => $order->created_at?->toIso8601String(),
                        'items' => $order->items->map(function ($item) {
                            return [
                                'id' => $item->id,
                                'item_name' => $item->item_name,
                                'quantity' => $item->quantity,
                                'unit_price' => $item->unit_price,
                                'modifiers' => $item->modifiers->map(function ($modifier) {
                                    return [
                                        'id' => $modifier->id,
                                        'modifier_name' => $modifier->modifier_name,
                                        'modifier_price' => $modifier->modifier_price,
                                    ];
                                })->values(),
                            ];
                        })->values(),
                        'payments' => $order->payments->map(function ($payment) {
                            return [
                                'method' => $payment->method,
                                'amount' => $payment->amount,
                            ];
                        })->values(),
                    ],
                ],
                'attempts' => 0,
                'last_error' => null,
            ]);

            $this->sendJob($job);
        }
    }

    private function sendJob(PrintJob $job): void
    {
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
