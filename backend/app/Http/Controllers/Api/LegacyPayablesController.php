<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use App\Services\LegacyPurchaseSettlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Clearing the orders that only look unpaid because payment tracking did
 * not exist when they were placed.
 *
 * Owner, 2026-09-21, looking at 103 of them on the Suppliers tab: "still
 * same". The artisan command was the whole answer and it lives on the
 * server, several steps from the card that raised the question. This is
 * the same work from the card itself.
 */
class LegacyPayablesController extends Controller
{
    public function __construct(private readonly LegacyPurchaseSettlementService $legacy) {}

    /** GET /purchasing/payables/legacy — what settling would clear. */
    public function show(Request $request): JsonResponse
    {
        $before = $this->cutOff($request);
        if ($before instanceof JsonResponse) {
            return $before;
        }

        $summary = $this->legacy->summarise($this->legacy->owing($before));

        return response()->json($summary + ['before' => $before->toDateString()]);
    }

    /** POST /purchasing/payables/legacy/settle — mark them paid. */
    public function settle(Request $request, AuditLogService $audit): JsonResponse
    {
        $before = $this->cutOff($request);
        if ($before instanceof JsonResponse) {
            return $before;
        }

        $except = collect($request->input('except', []))
            ->map(fn ($ref) => trim((string) $ref))
            ->filter()
            ->values()
            ->all();

        $orders = $this->legacy->owing($before, $except);
        if ($orders->isEmpty()) {
            return response()->json([
                'message' => 'Nothing to settle — the card is already showing real debt.',
                'settled' => 0,
                'total' => 0.0,
            ]);
        }

        $summary = $this->legacy->summarise($orders);
        // One entry for the lot, not 103: what was cleared, when, and by whom.
        $audit->log(
            'purchase.legacy_payables_settled',
            'Purchase',
            null,
            [],
            [],
            [
                'before' => $before->toDateString(),
                'orders' => $summary['orders'],
                'total' => $summary['total'],
                'purchase_numbers' => $orders->pluck('purchase_number')->all(),
                'except' => $except,
            ],
            $request,
        );

        $settled = $this->legacy->settle($orders);

        return response()->json([
            'message' => 'Settled ' . $settled . ' order' . ($settled === 1 ? '' : 's')
                . ' worth MVR ' . number_format($summary['total'], 2)
                . '. Any still owing? Open the order and undo its payment.',
            'settled' => $settled,
            'total' => $summary['total'],
        ]);
    }

    /** The cut-off asked for, or a 422 naming what could not be read. */
    private function cutOff(Request $request): \Carbon\CarbonImmutable|JsonResponse
    {
        try {
            return $this->legacy->cutOff($request->query('before') ?? $request->input('before'));
        } catch (\Throwable) {
            return response()->json(['message' => 'That is not a date this can read.'], 422);
        }
    }
}
