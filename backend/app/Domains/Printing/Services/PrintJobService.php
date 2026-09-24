<?php

declare(strict_types=1);

namespace App\Domains\Printing\Services;

use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\Receipt;
use App\Services\PrintProxyService;
use App\Support\ComplaintBoxLink;
use Illuminate\Support\Str;

class PrintJobService
{
    /** Hard cap on automatic retries — manual operator action required beyond this. */
    private const MAX_ATTEMPTS = 5;

    /**
     * Reasons that print once per order: a second call is the same event
     * retried, not a person asking for another copy.
     */
    private const ONCE_PER_ORDER_REASONS = ['initial', 'catering_fire'];

    /** Heading printed across the top of a kitchen chit, by reason. */
    private const HEADINGS = [
        'kds_reprint' => 'REPRINT',
        'resume_reprint' => 'REPRINT',
        'fire_to_kitchen' => null,
    ];

    /**
     * A full kitchen ticket.
     *
     * Kitchen audit, 2026-09-26: the key used to be order + printer + reason,
     * so the first reprint from the kitchen screen printed and every later
     * one found that job, already printed, and did nothing; the same for a
     * second fire. A person asking again now gets another copy. Taps inside
     * the same second collapse, so a double tap is still one ticket.
     */
    public function enqueueKitchen(Order $order, string $reason = 'initial'): void
    {
        $order->loadMissing('items.modifiers');
        $suffix = in_array($reason, self::ONCE_PER_ORDER_REASONS, true)
            ? $reason
            : $reason . ':' . now()->format('YmdHis');

        $this->sendKitchen(
            $order,
            $suffix,
            $order->items,
            self::HEADINGS[$reason] ?? null,
        );
    }

    /**
     * Only the lines the kitchen has not been told about, headed ADDED.
     *
     * An add-on used to reprint the whole order, so the first round could be
     * cooked twice; and its fixed key meant a second add-on printed nothing.
     */
    public function enqueueKitchenAdded(Order $order): void
    {
        $order->load('items.modifiers');
        $new = $order->items->whereNull('kitchen_sent_at')->values();
        if ($new->isEmpty()) {
            return;
        }

        $this->sendKitchen($order, 'added:' . $new->pluck('id')->sort()->implode('-'), $new, 'ADDED');
    }

    /**
     * An edited order: what to add and what to stop, never the whole ticket
     * again. $added and $voided are lines (quantity already the difference).
     *
     * @param list<array<string, mixed>> $added
     * @param list<array<string, mixed>> $voided
     */
    public function enqueueKitchenChanged(Order $order, array $added, array $voided): void
    {
        if ($added === [] && $voided === []) {
            $this->markSent($order);

            return;
        }

        $order->loadMissing('items.modifiers');
        $lines = array_merge(
            $added,
            array_map(fn (array $line) => array_merge($line, [
                // Prefixed in the name as well as flagged, so a print proxy
                // that has not been updated still prints "VOID:" rather than
                // a plain line somebody would cook.
                'item_name' => 'VOID: ' . $line['item_name'],
                'void' => true,
            ]), $voided),
        );

        $this->sendKitchenLines($order, 'changed:' . now()->format('YmdHisv'), $lines, 'CHANGED');
        $this->markSent($order);
    }

    /**
     * What changed between the lines the kitchen knew and the lines now, as
     * [added, voided], each a kitchen line whose quantity is the difference.
     * Lines match on what the cook would read: dish, size, packaging,
     * modifiers, note, and whether it is a platter pick.
     *
     * @param \Illuminate\Support\Collection<int, \App\Models\OrderItem> $before
     * @param \Illuminate\Support\Collection<int, \App\Models\OrderItem> $after
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    public function diffLines($before, $after): array
    {
        $group = function ($lines): array {
            $out = [];
            foreach ($lines as $line) {
                $line->loadMissing('modifiers');
                $mods = $line->modifiers->pluck('modifier_name')->sort()->implode('|');
                $key = implode('#', [
                    $line->item_id, $line->item_name, $line->variant_name, $line->packaging_option_name,
                    $mods, trim((string) $line->notes), $line->parent_order_item_id ? 'child' : 'top',
                ]);
                $out[$key] ??= ['line' => $line, 'qty' => 0];
                $out[$key]['qty'] += (int) $line->quantity;
            }

            return $out;
        };

        $was = $group($before);
        $now = $group($after);
        $added = [];
        $voided = [];

        foreach ($now as $key => $row) {
            $diff = $row['qty'] - ($was[$key]['qty'] ?? 0);
            if ($diff > 0) {
                $added[] = array_merge($this->kitchenLine($row['line']), ['quantity' => $diff]);
            }
        }
        foreach ($was as $key => $row) {
            $diff = $row['qty'] - ($now[$key]['qty'] ?? 0);
            if ($diff > 0) {
                $voided[] = array_merge($this->kitchenLine($row['line']), ['quantity' => $diff]);
            }
        }

        return [$added, $voided];
    }

    /**
     * Stop: the order was cancelled after the kitchen had it. Nothing used to
     * print; the ticket just vanished from the screen within a minute.
     */
    public function enqueueKitchenCancelled(Order $order): void
    {
        $order->load(['items' => fn ($q) => $q->withTrashed()->whereNotNull('kitchen_sent_at'), 'items.modifiers']);
        if ($order->items->isEmpty()) {
            return;
        }

        $lines = $order->items->map(fn ($item) => array_merge($this->kitchenLine($item), [
            'item_name' => 'CANCEL: ' . $item->item_name,
            'void' => true,
        ]))->values()->all();

        $this->sendKitchenLines($order, 'cancelled', $lines, 'CANCELLED - DO NOT MAKE');
    }

    /**
     * @param \Illuminate\Support\Collection<int, \App\Models\OrderItem> $items
     */
    private function sendKitchen(Order $order, string $suffix, $items, ?string $heading): void
    {
        $lines = $items->map(fn ($item) => $this->kitchenLine($item))->values()->all();
        $this->sendKitchenLines($order, $suffix, $lines, $heading);
        $this->markSent($order, $items->pluck('id')->all());
    }

    /** @param list<array<string, mixed>> $lines */
    private function sendKitchenLines(Order $order, string $suffix, array $lines, ?string $heading): void
    {
        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['kitchen', 'bar'])
            ->get();

        foreach ($printers as $printer) {
            $job = PrintJob::firstOrCreate(
                ['idempotency_key' => 'kitchen:' . $order->id . ':' . $printer->id . ':' . $suffix],
                [
                    'order_id' => $order->id,
                    'printer_id' => $printer->id,
                    'type' => $printer->type,
                    'status' => 'queued',
                    'payload' => $this->buildKitchenPayload($order, $printer, $lines, $heading),
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
     * The kitchen has been told about these lines (all current lines when
     * none are named). Stamped whether or not a printer is set up: the
     * kitchen screen showed them either way, and it is what tells an add-on
     * apart and a cancelled ticket worth flagging.
     *
     * @param list<int>|null $lineIds
     */
    private function markSent(Order $order, ?array $lineIds = null): void
    {
        $query = \App\Models\OrderItem::query()->where('order_id', $order->id)->whereNull('kitchen_sent_at');
        if ($lineIds !== null) {
            if ($lineIds === []) {
                return;
            }
            $query->whereIn('id', $lineIds);
        }
        $query->update(['kitchen_sent_at' => now()]);
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

        // Idempotent per order and printer: OrderCreated and OrderPaid can
        // both land for the same order.
        $lines = $order->items->map(fn ($item) => $this->kitchenLine($item))->values()->all();
        $printers = Printer::where('is_active', true)
            ->whereIn('type', ['kitchen', 'bar'])
            ->get();

        foreach ($printers as $printer) {
            $idempotencyKey = 'kitchen:' . $order->id . ':' . $printer->id;

            $job = PrintJob::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'printer_id' => $printer->id,
                    'type' => $printer->type,
                    'status' => 'queued',
                    'payload' => $this->buildKitchenPayload($order, $printer, $lines, null),
                    'attempts' => 0,
                    'last_error' => null,
                ],
            );

            if ($job->status === 'queued') {
                $this->sendJob($job);
            }
        }

        $this->markSent($order, $order->items->pluck('id')->all());
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

    /**
     * One kitchen line as the proxy prints it.
     *
     * @return array<string, mixed>
     */
    public function kitchenLine(\App\Models\OrderItem $item): array
    {
        return [
            'id' => $item->id,
            'item_name' => $item->item_name,
            'variant_name' => $item->variant_name,
            'packaging_option_name' => $item->packaging_option_name,
            'quantity' => $item->quantity,
            // Per-line kitchen note ("No salt", "Extra spicy"); the proxy
            // prints it on its own line so a busy kitchen can't miss it.
            'notes' => $item->parent_order_item_id ? null : $item->notes,
            // A platter's pick, printed indented under its platter.
            'is_child' => $item->parent_order_item_id !== null,
            'modifiers' => $item->modifiers->map(fn ($m) => [
                'id' => $m->id,
                'modifier_name' => $m->modifier_name,
                'modifier_price' => $m->modifier_price,
            ])->values()->all(),
            // What a fixed bundle is made of, as on the kitchen screen.
            'bundle_contents' => \App\Http\Controllers\Api\KdsController::bundleContents($item),
        ];
    }

    /** @param list<array<string, mixed>> $lines */
    private function buildKitchenPayload(Order $order, Printer $printer, array $lines, ?string $heading): array
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
                // Kitchen audit, 2026-09-26: what the screen showed and the
                // paper did not. ADDED / CHANGED / REPRINT / CANCELLED across
                // the top; where it goes; when it is wanted; what the
                // customer wrote.
                'heading' => $heading,
                'table' => $order->ticket_name
                    ?? ($order->restaurant_table_id ? \App\Models\RestaurantTable::whereKey($order->restaurant_table_id)->value('name') : null),
                'pickup_at' => $order->pickup_slot_at
                    ? $order->pickup_slot_at->copy()->timezone(config('app.timezone', 'Indian/Maldives'))->format('H:i')
                    : null,
                'customer_notes' => $order->customer_notes,
                'items' => $lines,
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
        // The complaint box (owner, 2026-09-19): "also add the complaint QR on
        // the receipt print". Always the live site, whatever host printed it.
        $complaintUrl = ComplaintBoxLink::url('receipt', (string) $order->order_number);

        return [
            'printer_name' => $printer->name,
            'type' => 'receipt',
            /** Public web receipt URL — print proxy should render as a QR code on the slip. */
            'receipt_url' => $receiptUrl,
            /** Complaint form on the live site — a second QR under the first. */
            'complaint_url' => $complaintUrl,
            'receipt' => [
                'url' => $receiptUrl,
                'token' => $receipt->token,
                'qr_payload' => $receiptUrl,
                'complaint_url' => $complaintUrl,
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
