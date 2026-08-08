<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KitchenProductionBatch;
use App\Models\KitchenProductionItem;
use App\Models\User;
use App\Services\KitchenProductionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class KitchenProductionController extends Controller
{
    public function __construct(
        private readonly KitchenProductionService $service,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = KitchenProductionBatch::with(['items', 'producer:id,name', 'order:id,order_number,type'])
            ->orderByDesc('created_at');

        if (!$request->user()->hasPermission('kitchen.production.view_all')) {
            $query->where('produced_by', $request->user()->id);
        }
        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', $request->string('status')));
        }
        if ($request->filled('production_type')) {
            $query->where('production_type', $request->query('production_type'));
        }

        $paginator = $query->paginate((int) $request->query('per_page', 20));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (KitchenProductionBatch $b) => $this->formatBatch($b)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'production_type' => ['required', Rule::in(KitchenProductionBatch::PRODUCTION_TYPES)],
            'source' => ['nullable', Rule::in(['kds', 'admin', 'pos'])],
            'station' => ['nullable', 'string', 'max:64'],
            'order_id' => ['nullable', 'integer', 'exists:orders,id'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.variant_id' => ['nullable', 'integer', 'exists:variants,id'],
            'items.*.free_text_name' => ['nullable', 'string', 'max:255'],
            'items.*.produced_qty' => ['required', 'numeric', 'min:0.001'],
            'items.*.unit' => ['nullable', 'string', 'max:32'],
            'items.*.expected_receive_qty' => ['nullable', 'numeric', 'min:0'],
            'items.*.batch_code' => ['nullable', 'string', 'max:64'],
            'items.*.expires_at' => ['nullable', 'date'],
            'items.*.notes' => ['nullable', 'string'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $batch = $this->service->createBatch($user, $validated, $request);

        return response()->json(['batch' => $this->formatBatch($batch)], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $batch = KitchenProductionBatch::with(['items.orderItem', 'items.menuItem', 'producer', 'order'])->findOrFail($id);
        $this->authorizeView($batch, $request->user());

        return response()->json(['batch' => $this->formatBatch($batch)]);
    }

    public function submit(Request $request, int $id): JsonResponse
    {
        $batch = KitchenProductionBatch::findOrFail($id);
        $batch = $this->service->submitBatch($batch, $request->user(), $request);

        return response()->json(['batch' => $this->formatBatch($batch)]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $batch = KitchenProductionBatch::findOrFail($id);
        $batch = $this->service->cancelBatch($batch, $request->user(), $validated['reason'] ?? null, $request);

        return response()->json(['batch' => $this->formatBatch($batch)]);
    }

    public function recordWaste(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $validated = $request->validate([
            'qty' => ['required', 'numeric', 'min:0.001'],
            'reason' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);
        $variance = $this->service->recordWaste($item, $request->user(), $validated, $request);

        return response()->json(['variance' => $variance]);
    }

    public function recordRemake(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $validated = $request->validate([
            'qty' => ['required', 'numeric', 'min:0.001'],
            'reason' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);
        $variance = $this->service->recordRemake($item, $request->user(), $validated, $request);

        return response()->json(['variance' => $variance]);
    }

    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $batch = KitchenProductionBatch::findOrFail($id);
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf,webp'],
            'type' => ['required', Rule::in(['production_photo', 'waste_photo', 'other'])],
            'kitchen_production_item_id' => ['nullable', 'integer'],
        ]);

        $itemId = $validated['kitchen_production_item_id'] ?? null;
        if ($itemId !== null) {
            // Must belong to this production batch — reject cross-parent IDs.
            $this->findItem($batch->id, (int) $itemId);
        }

        $path = $request->file('file')->store('kitchen-production/' . $batch->id, 'public');
        $attachment = $batch->attachments()->create([
            'kitchen_production_item_id' => $itemId,
            'uploaded_by' => $request->user()->id,
            'type' => $validated['type'],
            'file_path' => $path,
            'original_filename' => $request->file('file')->getClientOriginalName(),
            'mime_type' => $request->file('file')->getClientMimeType(),
            'size' => $request->file('file')->getSize(),
        ]);

        return response()->json([
            'attachment' => [
                'id' => $attachment->id,
                'url' => Storage::disk('public')->url($path),
            ],
        ], 201);
    }

    private function findItem(int $batchId, int $itemId): KitchenProductionItem
    {
        return KitchenProductionItem::where('kitchen_production_batch_id', $batchId)->where('id', $itemId)->firstOrFail();
    }

    private function authorizeView(KitchenProductionBatch $batch, User $user): void
    {
        if ($user->hasPermission('kitchen.production.view_all')) {
            return;
        }
        if ($batch->produced_by === $user->id && $user->hasPermission('kitchen.production.view_own')) {
            return;
        }
        abort(403);
    }

    public static function formatBatch(KitchenProductionBatch $batch): array
    {
        $batch->loadMissing(['items', 'producer', 'order']);

        return [
            'id' => $batch->id,
            'batch_no' => $batch->batch_no,
            'production_type' => $batch->production_type,
            'source' => $batch->source,
            'status' => $batch->status,
            'station' => $batch->station,
            'order_id' => $batch->order_id,
            'order' => $batch->order ? [
                'id' => $batch->order->id,
                'order_number' => $batch->order->order_number,
                'type' => $batch->order->type,
            ] : null,
            'producer' => $batch->producer ? ['id' => $batch->producer->id, 'name' => $batch->producer->name] : null,
            'submitted_at' => $batch->submitted_at?->toIso8601String(),
            'notes' => $batch->notes,
            'items' => $batch->items->map(fn (KitchenProductionItem $i) => [
                'id' => $i->id,
                'name' => $i->displayName(),
                'order_item_id' => $i->order_item_id,
                'item_id' => $i->item_id,
                'variant_id' => $i->variant_id,
                'produced_qty' => (float) $i->produced_qty,
                'expected_receive_qty' => (float) $i->expected_receive_qty,
                'waste_qty' => (float) $i->waste_qty,
                'unit' => $i->unit,
                'status' => $i->status,
                'kitchen_notes' => $i->kitchen_notes,
                'expires_at' => $i->expires_at?->toIso8601String(),
            ])->values()->all(),
            'created_at' => $batch->created_at?->toIso8601String(),
        ];
    }
}
