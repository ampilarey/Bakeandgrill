<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Support\PaymentChecks;
use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use App\Support\BusinessDay;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

/**
 * Finance → Bank settlements → Check payments: each QR and card payment ticked
 * against MPOS or the card slip (owner, 2026-10-28). See PaymentChecks.
 */
class PaymentCheckController extends Controller
{
    public function __construct(
        private readonly PaymentChecks $checks,
        private readonly AuditLogService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'method' => ['nullable', Rule::in(array_keys(PaymentChecks::METHOD_GROUPS))],
            'state' => ['nullable', Rule::in(PaymentChecks::STATES)],
            'user_id' => ['nullable', 'integer'],
            'device_id' => ['nullable', 'integer'],
            'min' => ['nullable', 'numeric', 'min:0'],
            'max' => ['nullable', 'numeric', 'min:0'],
            'q' => ['nullable', 'string', 'max:60'],
            'sort' => ['nullable', Rule::in(PaymentChecks::SORTS)],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:200'],
        ]);
        $to = isset($f['to']) ? Carbon::parse($f['to'])->toDateString() : BusinessDay::todayYmd();
        $from = isset($f['from']) ? Carbon::parse($f['from'])->toDateString() : $to;
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        return response()->json($this->checks->list([
            'from' => $from,
            'to' => $to,
            'method' => $f['method'] ?? null,
            'state' => $f['state'] ?? 'unchecked',
            'user_id' => isset($f['user_id']) ? (int) $f['user_id'] : null,
            'device_id' => isset($f['device_id']) ? (int) $f['device_id'] : null,
            'min' => isset($f['min']) ? (float) $f['min'] : null,
            'max' => isset($f['max']) ? (float) $f['max'] : null,
            'q' => $f['q'] ?? null,
            'sort' => $f['sort'] ?? 'newest',
            'page' => isset($f['page']) ? (int) $f['page'] : 1,
            'per_page' => isset($f['per_page']) ? (int) $f['per_page'] : 50,
        ]));
    }

    public function mark(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'result' => ['required', Rule::in([PaymentChecks::MATCHED, PaymentChecks::DIFFERENT])],
            'seen' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'reference' => ['nullable', 'string', 'max:40'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $payment = Payment::findOrFail($id);
        $before = $payment->only(['check_status', 'checked_amount_laar']);

        try {
            $this->checks->mark(
                $payment,
                $data['result'],
                isset($data['seen']) ? (float) $data['seen'] : null,
                $data['reference'] ?? null,
                $data['note'] ?? null,
                (int) $request->user()->id,
            );
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->log(
            'payment.checked',
            'Payment',
            $payment->id,
            $before,
            $payment->only(['check_status', 'checked_amount_laar', 'check_reference']),
            [],
            $request,
        );

        return response()->json(['payment' => $this->one($payment)]);
    }

    public function undo(Request $request, int $id): JsonResponse
    {
        $payment = Payment::findOrFail($id);
        $before = $payment->only(['check_status', 'checked_amount_laar']);
        $this->checks->undo($payment);
        $this->audit->log('payment.check_undone', 'Payment', $payment->id, $before, [], [], $request);

        return response()->json(['payment' => $this->one($payment)]);
    }

    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:200'], 'ids.*' => ['integer']]);
        $n = $this->checks->markManyMatched(array_map('intval', $data['ids']), (int) $request->user()->id);
        $this->audit->log('payment.checked_bulk', 'Payment', null, [], ['ids' => $data['ids'], 'marked' => $n], [], $request);

        return response()->json(['marked' => $n]);
    }

    /** From which day QR and card payments are asked about. */
    public function updateStart(Request $request): JsonResponse
    {
        $data = $request->validate(['start_date' => ['required', 'date']]);
        SiteSetting::set('payment_check_start_date', Carbon::parse($data['start_date'])->toDateString());

        return response()->json(['start_date' => PaymentChecks::startDate()]);
    }

    private function one(Payment $payment): array
    {
        $amount = PaymentChecks::amountLaar($payment);

        return [
            'id' => $payment->id,
            'check' => $payment->check_status === null ? null : [
                'status' => $payment->check_status,
                'seen_laar' => $payment->checked_amount_laar,
                'diff_laar' => (int) $payment->checked_amount_laar - $amount,
                'reference' => $payment->check_reference,
                'note' => $payment->check_note,
                'by' => $payment->checked_by ? \App\Models\User::whereKey($payment->checked_by)->value('name') : null,
                'at' => $payment->checked_at?->toIso8601String(),
            ],
        ];
    }
}
