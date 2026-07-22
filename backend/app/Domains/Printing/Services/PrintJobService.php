<?php

declare(strict_types=1);

namespace App\Domains\Printing\Services;

use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\Receipt;
use App\Services\PrintProxyService;
use Illuminate\Support\Str;

class PrintJobService
{
    /** Hard cap on automatic retries — manual operator action required beyond this. */
    private const MAX_ATTEMPTS = 5;

    /**
     * Enqueue a kitchen reprint with an explicit reason suffix on the
     * idempotency key so re-prints (e.g. POS resume with item changes)
     * don't collapse into the original print job's idempotency window.
     */
    public function enqueueKitchen(Order $order, string $reason = 'initial'): void
    {
        $order->loadMissing('items.modifiers');

        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['kitchen', 'bar'])
            ->get();

        foreach ($printers as $printer) {
            $idempotencyKey = 'kitchen:' . $order->id . ':' . $printer->id . ':' . $reason;

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
        // Hard cap so a stuck job (bad printer config, dead device) doesn't
        // get retried forever every time someone hits Retry in the admin UI
        // or the queue worker loops it. Manual operator action is needed
        // to clear the failed state past this — they can edit the printer,
        // null out the failure manually, or re-issue the print explicitly.
        if ($job->attempts >= self::MAX_ATTEMPTS) {
            $job->update([
                'status' => 'failed_permanent',
                'last_error' => sprintf(
                    'Max retry attempts (%d) reached. Last error: %s',
                    self::MAX_ATTEMPTS,
                    $job->last_error ?? 'unknown',
                ),
            ]);

            return;
        }
        $job->update(['status' => 'queued', 'last_error' => null]);
        $this->sendJob($job);
    }

    private function buildKitchenPayload(Order $order, Printer $printer): array
    {
        $notes = (string) ($order->notes ?? '');
        $setupTime = null;
        $dietaryNotes = null;

        if ($order->type === 'catering') {
            $event = \App\Models\CateringRequest::query()
                ->where('pos_order_id', $order->id)
                ->first(['setup_time', 'dietary_notes', 'fulfillment_time', 'venue_name', 'reference']);
            if ($event) {
                $setupTime = $event->setup_time
                    ? \Carbon\Carbon::parse($event->setup_time)->format('H:i')
                    : null;
                $dietaryNotes = $event->dietary_notes ? trim((string) $event->dietary_notes) : null;
                $banner = [];
                if ($setupTime) {
                    $banner[] = 'SETUP BY ' . $setupTime;
                }
                if ($dietaryNotes) {
                    $banner[] = 'DIETARY: ' . $dietaryNotes;
                }
                if ($banner !== []) {
                    $prefix = implode(' | ', $banner);
                    $notes = $notes !== '' ? $prefix . "\n" . $notes : $prefix;
                }
            }
        }

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
                'notes' => $notes !== '' ? $notes : $order->notes,
                // Explicit catering fields so print proxies can render them
                // larger / bolder than general notes.
                'setup_time' => $setupTime,
                'dietary_notes' => $dietaryNotes,
                'created_at' => $order->created_at?->toIso8601String(),
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'variant_name' => $item->variant_name,
                    'packaging_option_name' => $item->packaging_option_name,
                    'quantity' => $item->quantity,
                    // Per-line kitchen note ("No salt", "Extra spicy",
                    // etc.). The print proxy must render this bold /
                    // larger so a busy kitchen can't miss it.
                    'notes' => $item->notes,
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
        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }
        $receipt->customer_id = $order->customer_id;
        $receipt->save();

        $receiptUrl = rtrim((string) config('app.url'), '/') . '/receipts/' . $receipt->token;

        return [
            'printer_name' => $printer->name,
            'type' => 'receipt',
            /** Public web receipt URL — print proxy should render as a QR code on the slip. */
            'receipt_url' => $receiptUrl,
            'receipt' => [
                'url' => $receiptUrl,
                'token' => $receipt->token,
                'qr_payload' => $receiptUrl,
            ],
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
                'service_charge_enabled' => $order->service_charge_enabled,
                'service_charge_amount' => $order->service_charge_amount,
                'service_charge_label' => $order->service_charge_label,
                'service_charge_type' => $order->service_charge_type,
                'service_charge_value' => $order->service_charge_value,
                'total' => $order->total,
                'created_at' => $order->created_at?->toIso8601String(),
                'receipt_url' => $receiptUrl,
                'items' => $order->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_name' => $item->item_name,
                    'variant_name' => $item->variant_name,
                    'packaging_option_name' => $item->packaging_option_name,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'notes' => $item->notes,
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
