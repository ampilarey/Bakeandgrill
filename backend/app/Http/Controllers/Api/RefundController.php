<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveRefundRequest;
use App\Http\Requests\RejectRefundRequest;
use App\Http\Requests\StoreRefundRequest;
use App\Models\Order;
use App\Models\Refund;
use App\Services\ShiftAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class RefundController extends Controller
{
    public function __construct(
        private readonly RefundWorkflowService $workflow,
    ) {}

    public function index(Request $request)
    {
        // Viewing refunds stays on orders.refund (approvers / managers).
        Gate::authorize('refund.process');

        // Refund audit, 2026-09-25: a date range, a search, and an "owed"
        // view of approved refunds whose card / online share is still to be
        // returned. "processed" was offered as a filter but never written.
        $validated = $request->validate([
            'status' => 'nullable|in:pending,approved,rejected',
            'owed' => 'nullable|boolean',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'q' => 'nullable|string|max:120',
        ]);
        $query = Refund::with(['order', 'user', 'approver', 'paidOutBy'])->orderByDesc('created_at');

        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (!empty($validated['owed'])) {
            $query->owedExternally();
        }
        if (!empty($validated['from'])) {
            $query->where('created_at', '>=', \Carbon\Carbon::parse((string) $validated['from'])->startOfDay());
        }
        if (!empty($validated['to'])) {
            $query->where('created_at', '<=', \Carbon\Carbon::parse((string) $validated['to'])->endOfDay());
        }
        if (!empty($validated['q'])) {
            $q = trim((string) $validated['q']);
            $digits = preg_replace('/\D+/', '', $q) ?? '';
            $query->where(function ($w) use ($q, $digits): void {
                $w->where('reason', 'like', '%' . $q . '%')
                    ->orWhere('paid_out_reference', 'like', '%' . $q . '%')
                    ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', '%' . $q . '%'));
                if (strlen($digits) >= 4) {
                    $w->orWhere('refund_phone', 'like', '%' . $digits . '%');
                }
            });
        }

        $paginator = $query->paginate(50);
        $items = collect($paginator->items())->map(function (Refund $r) {
            $arr = $r->toArray();
            $arr['phone_flags'] = $this->workflow->phoneFlags($r);
            $arr['owed_externally'] = $r->isOwedExternally();

            return $arr;
        });
        $owed = Refund::query()->owedExternally();

        return response()->json([
            'refunds' => [
                'data' => $items,
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'meta' => [
                'approved_amount_total' => (float) Refund::whereIn('status', ['approved', 'processed'])->sum('amount'),
                'pending_count' => (int) Refund::where('status', 'pending')->count(),
                'otp_override_pending' => (int) Refund::where('status', 'pending')
                    ->where('otp_owner_override', true)
                    ->count(),
                'phone_added_pending' => (int) Refund::where('status', 'pending')
                    ->where('phone_added_at_refund', true)
                    ->count(),
                'external_owed_count' => (int) (clone $owed)->count(),
                'external_owed_total' => round(((int) (clone $owed)->sum('external_tender_laar')) / 100, 2),
            ],
        ]);
    }

    /**
     * POST /refunds/{id}/paid-out — the card / online / bank share was
     * returned to the customer (refund audit, 2026-09-25).
     */
    public function markPaidOut(Request $request, $id)
    {
        Gate::authorize('refund.process');

        $validated = $request->validate([
            'method' => 'required|in:bank_transfer,card_terminal,cash,other',
            'reference' => 'nullable|string|max:120',
        ]);
        $refund = Refund::findOrFail($id);
        $updated = $this->workflow->markPaidOut($refund, $request->user(), $validated['method'], $validated['reference'] ?? null, $request);

        $arr = $updated->toArray();
        $arr['phone_flags'] = $this->workflow->phoneFlags($updated);
        $arr['owed_externally'] = false;

        return response()->json(['refund' => $arr, 'message' => 'Marked paid out. The customer has been told the refund is complete.']);
    }

    public function show($id)
    {
        Gate::authorize('refund.process');

        $refund = Refund::with(['order', 'user', 'approver', 'paidOutBy'])->findOrFail($id);
        $arr = $refund->toArray();
        $arr['owed_externally'] = $refund->isOwedExternally();

        return response()->json([
            'refund' => $arr,
            'phone_flags' => $this->workflow->phoneFlags($refund),
        ]);
    }

    public function store(StoreRefundRequest $request, $orderId)
    {
        Gate::authorize('refund.request');

        $validated = $request->validated();
        $processorShift = app(ShiftAccessService::class)->requireOpenShift(
            $request->user(),
            'Open a shift before requesting a refund.',
        );

        $order = Order::with('customer')->findOrFail($orderId);

        $result = $this->workflow->request(
            $order,
            $request->user(),
            $validated,
            (int) $processorShift->id,
            $request,
        );

        $breakdown = $result['breakdown'];

        return response()->json([
            'refund' => $result['refund'],
            'auto_approved' => $result['auto_approved'],
            'phone_flags' => $result['phone_flags'],
            'breakdown' => [
                'credit_reversed_laar' => $breakdown['credit_reversed_laar'] ?? 0,
                'credit_reversed_mvr' => round(($breakdown['credit_reversed_laar'] ?? 0) / 100, 2),
                'gift_reversed_laar' => $breakdown['gift_reversed_laar'] ?? 0,
                'wallet_reversed_laar' => $breakdown['wallet_reversed_laar'] ?? 0,
                'gift_wallet_reversed_laar' => ($breakdown['gift_reversed_laar'] ?? 0) + ($breakdown['wallet_reversed_laar'] ?? 0),
                'gift_wallet_reversed_mvr' => round(
                    (($breakdown['gift_reversed_laar'] ?? 0) + ($breakdown['wallet_reversed_laar'] ?? 0)) / 100,
                    2,
                ),
                'external_tender_laar' => $breakdown['external_tender_laar'] ?? 0,
                'external_tender_mvr' => round(($breakdown['external_tender_laar'] ?? 0) / 100, 2),
                'drawer_cash_out_laar' => $breakdown['drawer_cash_out_laar'] ?? 0,
                'drawer_cash_out_mvr' => round(($breakdown['drawer_cash_out_laar'] ?? 0) / 100, 2),
                'cash_refund_override' => $breakdown['cash_refund_override'] ?? false,
            ],
        ], 201);
    }

    public function approve(ApproveRefundRequest $request, $id)
    {
        Gate::authorize('refund.process');

        // The approver's shift is the drawer the cash actually leaves — this
        // used to be required at the door and then thrown away, so an
        // overnight approval reduced the *requesting* shift's expected cash
        // and left today's cashier counting short.
        $refund = Refund::findOrFail($id);
        // No cash leaves any drawer for a card-only / credit-only refund, so
        // an owner approving from the admin needs no open shift for it
        // (refund audit, 2026-09-25).
        $approverShift = (int) $refund->drawer_cash_out_laar > 0
            ? app(ShiftAccessService::class)->requireOpenShift($request->user(), 'Open a shift before approving a refund that pays cash from the drawer.')
            : app(ShiftAccessService::class)->findOpenShift($request->user());

        $validated = $request->validated();
        $approved = $this->workflow->approve(
            $refund,
            $request->user(),
            $request,
            allowSelf: false,
            otpCode: isset($validated['otp']) ? (string) $validated['otp'] : null,
            ownerOverrideWithoutOtp: (bool) ($validated['owner_override_without_otp'] ?? false),
            drawerShiftId: $approverShift?->id,
        );

        return response()->json([
            'refund' => $approved,
            'phone_flags' => $this->workflow->phoneFlags($approved),
        ]);
    }

    public function reject(RejectRefundRequest $request, $id)
    {
        Gate::authorize('refund.process');

        $refund = Refund::findOrFail($id);
        $rejected = $this->workflow->reject(
            $refund,
            $request->user(),
            (string) $request->validated()['rejection_reason'],
            $request,
        );

        return response()->json(['refund' => $rejected]);
    }

    public function resendOtp(Request $request, $id)
    {
        Gate::authorize('refund.process');

        $refund = Refund::findOrFail($id);
        $fresh = $this->workflow->resendOtp($refund, $request->user(), $request);

        return response()->json([
            'refund' => $fresh,
            'message' => 'Verification code sent to the refund phone number.',
        ]);
    }
}
