<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Support\KitchenHandoverSettings;
use App\Http\Controllers\Controller;
use App\Models\KitchenProductionVariance;
use App\Services\KitchenVarianceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KitchenVarianceController extends Controller
{
    public function __construct(
        private readonly KitchenVarianceService $service,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $reviewed = $request->query('reviewed');
        $filter = $reviewed === '1' ? true : ($reviewed === '0' ? false : null);
        $paginator = $this->service->list($filter, (int) $request->query('per_page', 20));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (KitchenProductionVariance $v) => $this->formatVariance($v)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function review(Request $request, int $id): JsonResponse
    {
        $variance = KitchenProductionVariance::findOrFail($id);
        $validated = $request->validate(['notes' => ['nullable', 'string']]);
        $variance = $this->service->review($variance, $request->user(), $validated, $request);

        return response()->json(['variance' => $this->formatVariance($variance)]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kitchen_require_pos_receiving_before_ready' => ['sometimes', 'boolean'],
            'kitchen_receive_updates_prepared_stock' => ['sometimes', 'boolean'],
            'kitchen_manager_verification_for_prepared_stock' => ['sometimes', 'boolean'],
            'kitchen_allow_staff_prepared_stock_batches' => ['sometimes', 'boolean'],
            'kitchen_photo_required_for_reject_waste' => ['sometimes', 'boolean'],
            'kitchen_production_consumes_recipe_stock' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['settings' => KitchenHandoverSettings::update($validated)]);
    }

    private function formatVariance(KitchenProductionVariance $v): array
    {
        $v->loadMissing(['recorder', 'batch']);

        return [
            'id' => $v->id,
            'batch_id' => $v->kitchen_production_batch_id,
            'batch_no' => $v->batch?->batch_no,
            'variance_type' => $v->variance_type,
            'qty' => (float) $v->qty,
            'unit' => $v->unit,
            'reason' => $v->reason,
            'notes' => $v->notes,
            'recorded_by' => $v->recorder ? ['id' => $v->recorder->id, 'name' => $v->recorder->name] : null,
            'reviewed_at' => $v->reviewed_at?->toIso8601String(),
            'created_at' => $v->created_at?->toIso8601String(),
        ];
    }
}
