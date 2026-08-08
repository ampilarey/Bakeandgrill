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

        $allowedStatuses = ['pending', 'approved', 'rejected', 'processed'];
        $query = Refund::with(['order', 'user', 'approver'])->orderByDesc('created_at');

        if ($request->filled('status') && in_array($request->query('status'), $allowedStatuses, true)) {
            $query->where('status', $request->query('status'));
        }

        $paginator = $query->paginate(50);
        $items = collect($paginator->items())->map(function (Refund $r) {
            $arr = $r->toArray();
            $arr['phone_flags'] = $this->workflow->phoneFlags($r);

            return $arr;
        });

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
            ],
        ]);
    }

    public function show($id)
    {
        Gate::authorize('refund.process');

        $refund = Refund::with(['order', 'user', 'approver'])->findOrFail($id);

        return response()->json([
            'refund' => $refund,
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

        app(ShiftAccessService::class)->requireOpenShift(
            $request->user(),
            'Open a shift before approving a refund.',
        );

        $validated = $request->validated();
        $refund = Refund::findOrFail($id);
        $approved = $this->workflow->approve(
            $refund,
            $request->user(),
            $request,
            allowSelf: false,
            otpCode: isset($validated['otp']) ? (string) $validated['otp'] : null,
            ownerOverrideWithoutOtp: (bool) ($validated['owner_override_without_otp'] ?? false),
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
