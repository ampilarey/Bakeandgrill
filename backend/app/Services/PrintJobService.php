<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;

class PrintJobService
{
    /**
     * Alias used by DispatchKitchenPrintListener.
     */
    public function dispatchKitchenJobs(Order $order): void
    {
        $this->dispatchKitchen($order);
    }

    /**
     * Alias used by DispatchReceiptPrintListener.
     */
    public function dispatchReceiptJobs(Order $order): void
    {
        $this->dispatchReceipt($order);
    }

    public function dispatchKitchen(Order $order): void
    {
        $order->loadMissing('items.modifiers');

        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['kitchen', 'bar'])
            ->get();

        if ($printers->isEmpty()) {
            return;
        }

        foreach ($printers as $printer) {
            $idempotencyKey = 'kitchen:' . $order->id . ':' . $printer->id;

            $job = PrintJob::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'printer_id' => $printer->id,
                    'type' => $printer->type,
                    'status' => 'queued',
                    'payload' => $this->buildKitchenPayload($order, $printer),
                    'attempts' => 0,
                    'last_error' => null,
                ],
            );

            if ($job->status === 'queued') {
                $this->sendJob($job);
            }
        }
    }

    public function dispatchReceipt(Order $order): void
    {
        $order->loadMissing('items.modifiers', 'payments');

        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['receipt', 'counter'])
            ->get();

        if ($printers->isEmpty()) {
            return;
        }

        foreach ($printers as $printer) {
            $idempotencyKey = 'receipt:' . $order->id . ':' . $printer->id;

            $job = PrintJob::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'printer_id' => $printer->id,
                    'type' => 'receipt',
                    'status' => 'queued',
                    'payload' => $this->buildReceiptPayload($order, $printer),
                    'attempts' => 0,
                    'last_error' => null,
                ],
            );

            if ($job->status === 'queued') {
                $this->sendJob($job);
            }
        }
    }

    public function retry(PrintJob $job): void
    {
        $job->update(['status' => 'queued', 'last_error' => null]);
        $this->sendJob($job);
    }

    private function buildKitchenPayload(Order $order, Printer $printer): array
    {
        return [
            'printer_name' => $printer->name,
            'type' => $printer->type,
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
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'quantity' => $item->quantity,
                    'modifiers' => $item->modifiers->map(fn ($m) => [
                        'id' => $m->id,
                        'modifier_name' => $m->modifier_name,
                        'modifier_price' => $m->modifier_price,
                    ])->values(),
                ])->values(),
            ],
        ];
    }

    private function buildReceiptPayload(Order $order, Printer $printer): array
    {
        return [
            'printer_name' => $printer->name,
            'type' => 'receipt',
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
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'modifiers' => $item->modifiers->map(fn ($m) => [
                        'id' => $m->id,
                        'modifier_name' => $m->modifier_name,
                        'modifier_price' => $m->modifier_price,
                    ])->values(),
                ])->values(),
                'payments' => $order->payments->map(fn ($p) => [
                    'method' => $p->method,
                    'amount' => $p->amount,
                ])->values(),
            ],
        ];
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
