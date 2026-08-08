<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Kitchen\Support\KitchenHandoverSettings;
use App\Http\Controllers\Controller;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Services\KitchenReceivingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class KitchenReceivingController extends Controller
{
    public function __construct(
        private readonly KitchenReceivingService $service,
    ) {}

    public function settings(): JsonResponse
    {
        return response()->json(['settings' => KitchenHandoverSettings::all()]);
    }

    public function pending(Request $request): JsonResponse
    {
        $orderId = $request->query('order_id') ? (int) $request->query('order_id') : null;
        $batches = $this->service->pendingBatches($orderId);

        return response()->json([
            'data' => $batches->map(fn (KitchenProductionBatch $b) => KitchenProductionController::formatBatch($b)),
        ]);
    }

    public function forOrder(int $orderId): JsonResponse
    {
        $batches = $this->service->pendingBatches($orderId);

        return response()->json([
            'data' => $batches->map(fn (KitchenProductionBatch $b) => KitchenProductionController::formatBatch($b)),
        ]);
    }

    public function receiveAll(Request $request, int $productionBatchId): JsonResponse
    {
        $batch = KitchenProductionBatch::with('items')->findOrFail($productionBatchId);
        $validated = $request->validate([
            'receive_location' => ['nullable', Rule::in(['pos_counter', 'takeaway_counter', 'dine_in_service', 'delivery_packaging', 'storage', 'other'])],
            'notes' => ['nullable', 'string'],
        ]);

        $receiving = $this->service->receiveAll($batch, $request->user(), $validated, $request);

        return response()->json([
            'receiving_batch' => $this->formatReceivingBatch($receiving),
            'batch' => KitchenProductionController::formatBatch($batch->fresh(['items', 'producer', 'order'])),
        ]);
    }

    public function receiveItem(Request $request, int $productionBatchId, int $itemId): JsonResponse
    {
        $batch = KitchenProductionBatch::findOrFail($productionBatchId);
        $item = KitchenProductionItem::where('kitchen_production_batch_id', $batch->id)->where('id', $itemId)->firstOrFail();
        $validated = $request->validate([
            'received_qty' => ['nullable', 'numeric', 'min:0.001'],
            'receive_location' => ['nullable', Rule::in(['pos_counter', 'takeaway_counter', 'dine_in_service', 'delivery_packaging', 'storage', 'other'])],
            'condition' => ['nullable', Rule::in(['good', 'cold', 'damaged', 'wrong_item', 'undercooked', 'overcooked', 'missing', 'other'])],
            'notes' => ['nullable', 'string'],
        ]);

        $receiving = $this->service->receiveItem($batch, $item, $request->user(), $validated, $request);

        return response()->json([
            'receiving_batch' => $this->formatReceivingBatch($receiving),
            'batch' => KitchenProductionController::formatBatch($batch->fresh(['items', 'producer', 'order'])),
        ]);
    }

    public function rejectItem(Request $request, int $productionBatchId, int $itemId): JsonResponse
    {
        $batch = KitchenProductionBatch::findOrFail($productionBatchId);
        $item = KitchenProductionItem::where('kitchen_production_batch_id', $batch->id)->where('id', $itemId)->firstOrFail();
        $validated = $request->validate([
            'rejected_qty' => ['nullable', 'numeric', 'min:0.001'],
            'condition' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'receive_location' => ['nullable', 'string'],
        ]);

        $recvItem = $this->service->rejectItem($batch, $item, $request->user(), $validated, $request);

        return response()->json(['receiving_item' => $recvItem, 'batch' => KitchenProductionController::formatBatch($batch->fresh(['items']))]);
    }

    public function requestRemake(Request $request, int $productionBatchId, int $itemId): JsonResponse
    {
        $batch = KitchenProductionBatch::findOrFail($productionBatchId);
        $item = KitchenProductionItem::where('kitchen_production_batch_id', $batch->id)->where('id', $itemId)->firstOrFail();
        $validated = $request->validate([
            'qty' => ['nullable', 'numeric', 'min:0.001'],
            'reason' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $variance = $this->service->requestRemake($batch, $item, $request->user(), $validated, $request);

        return response()->json(['variance' => $variance]);
    }

    public function uploadAttachment(Request $request, int $productionBatchId): JsonResponse
    {
        $batch = KitchenProductionBatch::findOrFail($productionBatchId);
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf,webp'],
            'type' => ['required', Rule::in(['receiving_photo', 'rejection_photo', 'other'])],
            'kitchen_production_item_id' => ['nullable', 'integer'],
        ]);

        $itemId = $validated['kitchen_production_item_id'] ?? null;
        if ($itemId !== null) {
            KitchenProductionItem::where('kitchen_production_batch_id', $batch->id)
                ->where('id', $itemId)
                ->firstOrFail();
        }

        $path = $request->file('file')->store('kitchen-receiving/' . $batch->id, 'public');
        $attachment = $batch->attachments()->create([
            'kitchen_production_item_id' => $itemId,
            'uploaded_by' => $request->user()->id,
            'type' => $validated['type'],
            'file_path' => $path,
            'original_filename' => $request->file('file')->getClientOriginalName(),
            'mime_type' => $request->file('file')->getClientMimeType(),
            'size' => $request->file('file')->getSize(),
        ]);

        return response()->json(['attachment' => ['id' => $attachment->id, 'url' => Storage::disk('public')->url($path)]], 201);
    }

    private function formatReceivingBatch($receiving): array
    {
        return [
            'id' => $receiving->id,
            'status' => $receiving->status,
            'received_at' => $receiving->received_at?->toIso8601String(),
            'receive_location' => $receiving->receive_location,
        ];
    }
}
