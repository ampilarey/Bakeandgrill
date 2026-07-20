<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Services\CateringEventFireService;
use App\Domains\Catering\Services\CateringLifecycleNotifier;
use App\Domains\Catering\Services\CateringQuoteApprovalService;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use App\Models\Payment;
use App\Services\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POS Events surface — read for all staff; mutations require events.manage.
 */
class PosEventController extends Controller
{
    public function __construct(
        private readonly CateringEventFireService $fireService,
        private readonly CateringQuoteApprovalService $approval,
        private readonly CateringLifecycleNotifier $lifecycle,
        private readonly AuditLogService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', 'nullable', 'string'],
        ]);

        $from = isset($validated['from'])
            ? Carbon::parse($validated['from'])->toDateString()
            : now()->subDays(2)->toDateString();
        $to = isset($validated['to'])
            ? Carbon::parse($validated['to'])->toDateString()
            : now()->addDays(21)->toDateString();

        $query = CateringRequest::query()
            ->with([
                'lines',
                'handler:id,name',
                'posOrder:id,order_number,type,status,payment_status,total,total_laar,fired_at,subtotal,tax_amount',
            ])
            ->whereBetween('event_date', [$from, $to])
            ->whereIn('status', [
                'awaiting_customer',
                'confirmed',
                'completed',
                'cancelled',
                'quoted',
            ])
            ->orderBy('event_date')
            ->orderBy('setup_time')
            ->orderBy('id');

        if (!empty($validated['status'])) {
            $statuses = array_values(array_filter(array_map('trim', explode(',', $validated['status']))));
            if ($statuses !== []) {
                $query->whereIn('status', $statuses);
            }
        }

        $events = $query->get()->map(fn (CateringRequest $row) => $this->formatEvent($row))->values();

        return response()->json([
            'events' => $events,
            'meta' => [
                'from' => $from,
                'to' => $to,
                'today' => now()->toDateString(),
            ],
        ]);
    }

    public function fire(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'confirm_shortages' => ['sometimes', 'boolean'],
        ]);

        $row = CateringRequest::query()->findOrFail($id);
        $result = $this->fireService->fire(
            $row,
            (bool) ($validated['confirm_shortages'] ?? false),
            $request,
        );

        if (!$result['fired'] && $result['shortages'] !== []) {
            return response()->json([
                'message' => 'Some items are short or unavailable. Confirm to send to kitchen anyway.',
                'requires_confirmation' => true,
                'shortages' => $result['shortages'],
            ], 409);
        }

        return response()->json([
            'message' => $result['already_fired']
                ? 'Already sent to kitchen.'
                : 'Sent to kitchen.',
            'already_fired' => $result['already_fired'],
            'shortages' => $result['shortages'],
            'order' => [
                'id' => $result['order']->id,
                'order_number' => $result['order']->order_number,
                'status' => $result['order']->status,
                'fired_at' => $result['order']->fired_at?->toIso8601String(),
                'payment_status' => $result['order']->payment_status,
            ],
            'event' => $this->formatEvent($row->fresh([
                'lines',
                'handler:id,name',
                'posOrder:id,order_number,type,status,payment_status,total,total_laar,fired_at,subtotal,tax_amount',
            ])),
        ]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $row = CateringRequest::query()->findOrFail($id);
        if ($row->status === 'cancelled') {
            return response()->json([
                'message' => 'Already cancelled.',
                'event' => $this->formatEvent($row->load([
                    'lines',
                    'handler:id,name',
                    'posOrder:id,order_number,type,status,payment_status,total,total_laar,fired_at,subtotal,tax_amount',
                ])),
            ]);
        }

        $oldStatus = $row->status;
        $this->approval->cancelPendingOrderIfAny($row);
        $row->refresh();
        $row->update(['status' => 'cancelled']);
        $row = $row->fresh([
            'lines',
            'handler:id,name',
            'posOrder:id,order_number,type,status,payment_status,total,total_laar,fired_at,subtotal,tax_amount',
        ]);

        if ($oldStatus !== 'cancelled') {
            $this->lifecycle->notifyCancelled($row);
        }

        $this->audit->log(
            'catering.cancelled',
            'CateringRequest',
            $row->id,
            ['status' => $oldStatus],
            ['status' => 'cancelled'],
            [],
            $request,
        );

        return response()->json([
            'message' => 'Event cancelled.',
            'event' => $this->formatEvent($row),
        ]);
    }

    /** @return array<string, mixed> */
    private function formatEvent(CateringRequest $row): array
    {
        $order = $row->relationLoaded('posOrder') ? $row->posOrder : null;
        $totalLaar = 0;
        $paidLaar = 0;
        $paymentState = 'none';
        $firedAt = null;
        $orderId = null;
        $orderNumber = null;
        $orderStatus = null;

        if ($order) {
            $orderId = (int) $order->id;
            $orderNumber = $order->order_number;
            $orderStatus = $order->status;
            $firedAt = $order->fired_at?->toIso8601String();
            $totalLaar = (int) ($order->total_laar ?? (int) round(((float) $order->total) * 100));
            $paidLaar = (int) Payment::query()
                ->where('order_id', $order->id)
                ->whereIn('status', ['confirmed', 'paid', 'completed'])
                ->sum('amount_laar');
            $balance = max(0, $totalLaar - $paidLaar);
            if ($balance <= 0 && $totalLaar > 0) {
                $paymentState = 'paid';
            } elseif ($paidLaar > 0) {
                $paymentState = 'partial';
            } else {
                $paymentState = 'pending';
            }
        } elseif ($row->status === 'awaiting_customer') {
            $paymentState = 'pending';
            $totalLaar = (int) ($row->quote_payment_laar ?? $row->quote_subtotal_laar ?? 0);
        }

        $chip = $this->displayChip($row, $order);

        return [
            'id' => $row->id,
            'reference' => $row->reference,
            'status' => $row->status,
            'display_status' => $chip,
            'contact_name' => $row->contact_name,
            'phone' => $row->phone,
            'event_date' => $row->event_date?->toDateString(),
            'fulfillment_method' => $row->fulfillment_method ?? 'pickup',
            'fulfillment_time' => $row->fulfillment_time
                ? Carbon::parse($row->fulfillment_time)->format('H:i')
                : null,
            'setup_time' => $row->setup_time
                ? Carbon::parse($row->setup_time)->format('H:i')
                : null,
            'venue_name' => $row->venue_name,
            'delivery_address' => $row->delivery_address,
            'delivery_island' => $row->delivery_island,
            'onsite_contact_name' => $row->onsite_contact_name,
            'onsite_contact_phone' => $row->onsite_contact_phone,
            'headcount' => $row->headcount,
            'dietary_notes' => $row->dietary_notes,
            'handled_by' => $row->handler ? [
                'id' => $row->handler->id,
                'name' => $row->handler->name,
            ] : null,
            'lines' => $row->lines->map(fn ($l) => [
                'id' => $l->id,
                'name' => $l->name,
                'quantity' => (int) $l->quantity,
                'unit_price' => $l->unit_price !== null ? (float) $l->unit_price : null,
                'is_custom' => (bool) $l->is_custom,
                'notes' => $l->notes,
            ])->values()->all(),
            'order' => $orderId ? [
                'id' => $orderId,
                'order_number' => $orderNumber,
                'status' => $orderStatus,
                'fired_at' => $firedAt,
                'payment_status' => $order?->payment_status,
                'payment_state' => $paymentState,
                'paid_laar' => $paidLaar,
                'balance_laar' => max(0, $totalLaar - $paidLaar),
                'total_laar' => $totalLaar,
            ] : null,
            'quote_is_deposit' => (bool) $row->quote_is_deposit,
            'quote_payment_laar' => $row->quote_payment_laar,
        ];
    }

    private function displayChip(CateringRequest $row, mixed $order): string
    {
        return match ($row->status) {
            'cancelled' => 'cancelled',
            'completed' => 'completed',
            'awaiting_customer' => 'awaiting_payment',
            'confirmed' => ($order && $order->fired_at) ? 'in_prep' : 'confirmed',
            default => $row->status,
        };
    }
}
