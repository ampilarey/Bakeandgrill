<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Domains\Orders\Services\DiscountApprovalService;
use App\Http\Controllers\Controller;
use App\Models\DiscountApproval;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiscountApprovalController extends Controller
{
    public function __construct(
        private readonly DiscountApprovalService $approvals,
    ) {}

    /**
     * POST /api/orders/{order}/discount/request-approval
     */
    public function requestApproval(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'discount_amount' => 'required|numeric|min:0.01',
            'discount_reason' => 'nullable|string|max:255',
            'discount_reason_note' => 'nullable|string|max:255',
        ]);

        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $result = $this->approvals->requestApproval(
            $order,
            $user,
            (float) $validated['discount_amount'],
            $validated['discount_reason'] ?? null,
            $validated['discount_reason_note'] ?? null,
            $request,
        );

        return response()->json($result);
    }

    /**
     * POST /api/orders/{order}/discount/confirm
     */
    public function confirm(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'approval_id' => 'required|integer',
            // No code when the approver tapped Approve on Telegram.
            'code' => 'nullable|string|size:4',
            'discount_amount' => 'nullable|numeric|min:0',
        ]);

        $user = $request->user();
        if (!$user instanceof User) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $updated = $this->approvals->confirm(
            $order,
            $user,
            (int) $validated['approval_id'],
            isset($validated['code']) ? (string) $validated['code'] : null,
            $request,
        );

        return response()->json(['order' => $updated->load(['items.item', 'manualDiscountApprover'])]);
    }

    /**
     * GET /api/orders/{order}/discount/approval/{approval}
     * The till asks while it waits: has the approver tapped Approve or
     * Decline on Telegram?
     */
    public function status(Request $request, Order $order, int $approval): JsonResponse
    {
        $row = DiscountApproval::query()->where('id', $approval)->where('order_id', $order->id)->first();
        if ($row === null) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return response()->json($this->approvals->status($row));
    }
}
