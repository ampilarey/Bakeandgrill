<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePurchaseRequestItemQuoteRequest;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestAttachment;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestItemQuote;
use App\Models\User;
use App\Services\PurchaseRequestPriceHintService;
use App\Services\PurchaseRequestService;
use App\Services\PurchaseRequestVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PurchaseRequestController extends Controller
{
    public function __construct(
        private readonly PurchaseRequestService $service,
        private readonly PurchaseRequestVerificationService $verification,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $statuses = $this->parseStatuses($request->query('status'));
        $query = PurchaseRequest::with(['requester:id,name', 'assignee:id,name', 'items'])
            ->orderByDesc('created_at');

        if ($statuses) {
            $query->whereIn('status', $statuses);
        }
        if ($request->filled('priority')) {
            $query->where('priority', $request->query('priority'));
        }

        $paginator = $query->paginate((int) $request->query('per_page', 20));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (PurchaseRequest $pr) => $this->formatRequest($pr, $request->user(), false)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function my(Request $request): JsonResponse
    {
        $user = $request->user();
        $rows = PurchaseRequest::with(['requester:id,name', 'assignee:id,name', 'items'])
            ->where('requested_by', $user->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'data' => $rows->map(fn (PurchaseRequest $pr) => $this->formatRequest($pr, $user, true)),
        ]);
    }

    public function assignedToMe(Request $request): JsonResponse
    {
        $user = $request->user();
        $rows = PurchaseRequest::with(['requester:id,name', 'items'])
            ->where('assigned_to', $user->id)
            ->whereIn('status', ['assigned', 'buying', 'partially_bought'])
            ->orderByDesc('priority')
            ->orderBy('needed_by')
            ->get();

        return response()->json([
            'data' => $rows->map(fn (PurchaseRequest $pr) => $this->formatRequest($pr, $user, true)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'source' => ['required', Rule::in(['pos', 'kds', 'admin', 'restock', 'recurring_list'])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'urgent'])],
            'needed_by' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'items.*.menu_item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.free_text_name' => ['nullable', 'string', 'max:255'],
            'items.*.category' => ['nullable', 'string', 'max:64'],
            'items.*.requested_qty' => ['required', 'numeric', 'min:0.001'],
            'items.*.requested_unit' => ['required', 'string', 'max:32'],
            'items.*.estimated_unit_cost_laar' => ['nullable', 'integer', 'min:0'],
            'items.*.reason' => ['nullable', Rule::in(['low_stock', 'finished', 'damaged', 'urgent_order', 'packaging', 'cleaning', 'gas', 'other'])],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        foreach ($validated['items'] as $line) {
            if (empty($line['inventory_item_id']) && empty($line['menu_item_id']) && empty($line['free_text_name'])) {
                throw ValidationException::withMessages(['items' => ['Each line needs a name or item reference.']]);
            }
        }

        /** @var User $user */
        $user = $request->user();
        $pr = $this->service->create($user, $validated, $validated['items'], $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, true)], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::with(['items.inventoryItem', 'items.menuItem', 'requester', 'assignee', 'attachments'])->findOrFail($id);
        $this->authorizeView($pr, $request->user());

        return response()->json(['request' => $this->formatRequest($pr, $request->user(), !$request->user()->hasPermission('purchase_requests.view_all'))]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::with('items')->findOrFail($id);
        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'urgent'])],
            'needed_by' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['nullable', 'array'],
            'items.*.id' => ['required', 'integer'],
            'items.*.approved_qty' => ['nullable', 'numeric', 'min:0'],
            'items.*.requested_qty' => ['nullable', 'numeric', 'min:0.001'],
            'items.*.notes' => ['nullable', 'string'],
        ]);

        /** @var User $user */
        $user = $request->user();
        $pr = $this->service->update($pr, $validated, $user, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, false)]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::with('items')->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $pr = $this->service->approve($pr, $user, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, false)]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $pr = PurchaseRequest::findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $pr = $this->service->reject($pr, $user, $validated['reason'] ?? null, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, false)]);
    }

    public function assign(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['assigned_to' => ['required', 'integer', 'exists:users,id']]);
        $pr = PurchaseRequest::findOrFail($id);
        $assignee = User::findOrFail($validated['assigned_to']);
        /** @var User $user */
        $user = $request->user();
        $pr = $this->service->assign($pr, $assignee, $user, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, false)]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        if ($pr->requested_by !== $user->id && !$user->hasPermission('purchase_requests.cancel')) {
            abort(403);
        }
        $pr = $this->service->cancel($pr, $user, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, true)]);
    }

    public function markBought(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $validated = $request->validate([
            'actual_qty' => ['nullable', 'numeric', 'min:0.001'],
            'actual_unit' => ['nullable', 'string', 'max:32'],
            'actual_unit_cost_laar' => ['nullable', 'integer', 'min:0'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'supplier_name_text' => ['nullable', 'string', 'max:255'],
            'buyer_notes' => ['nullable', 'string', 'max:1000'],
            'from_quote_id' => ['nullable', 'integer', 'exists:purchase_request_item_quotes,id'],
        ]);
        /** @var User $user */
        $user = $request->user();
        $item = $this->service->markBought($item, $user, $validated, $request);

        return response()->json(['item' => $this->formatItem($item, $user, true), 'request' => $this->formatRequest($item->purchaseRequest, $user, true)]);
    }

    public function markPartial(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $validated = $request->validate([
            'actual_qty' => ['required', 'numeric', 'min:0.001'],
            'actual_unit' => ['nullable', 'string', 'max:32'],
            'actual_unit_cost_laar' => ['nullable', 'integer', 'min:0'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'supplier_name_text' => ['nullable', 'string', 'max:255'],
            'buyer_notes' => ['nullable', 'string', 'max:1000'],
        ]);
        /** @var User $user */
        $user = $request->user();
        $item = $this->service->markPartial($item, $user, $validated, $request);

        return response()->json(['item' => $this->formatItem($item, $user, true), 'request' => $this->formatRequest($item->purchaseRequest, $user, true)]);
    }

    public function markNotAvailable(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $validated = $request->validate(['buyer_notes' => ['nullable', 'string', 'max:1000']]);
        /** @var User $user */
        $user = $request->user();
        $item = $this->service->markNotAvailable($item, $user, $validated['buyer_notes'] ?? null, $request);

        return response()->json(['item' => $this->formatItem($item, $user, true), 'request' => $this->formatRequest($item->purchaseRequest, $user, true)]);
    }

    public function verifyItem(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $validated = $request->validate([
            'inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'verified_notes' => ['nullable', 'string', 'max:1000'],
        ]);
        /** @var User $user */
        $user = $request->user();
        $result = $this->verification->verifyItem($item, $user, $validated, $request);

        return response()->json([
            'item' => $this->formatItem($result['item'], $user, false),
            'request' => $this->formatRequest($result['request'], $user, false),
            'warnings' => $result['warnings'],
        ]);
    }

    public function verifyAll(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::with('items')->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $pr = $this->verification->verifyAll($pr, $user, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, false)]);
    }

    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::findOrFail($id);
        $this->authorizeView($pr, $request->user());

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf,webp'],
            'type' => ['required', Rule::in(['request_photo', 'receipt', 'delivery_note', 'other'])],
            'purchase_request_item_id' => ['nullable', 'integer'],
        ]);

        $itemId = $validated['purchase_request_item_id'] ?? null;
        if ($itemId !== null) {
            // Must belong to this purchase request — reject cross-parent IDs.
            $this->findItem($pr->id, (int) $itemId);
        }

        /** @var User $user */
        $user = $request->user();
        $file = $request->file('file');
        $path = $file->store('purchase-requests/' . $pr->id, 'public');

        $attachment = PurchaseRequestAttachment::create([
            'purchase_request_id' => $pr->id,
            'purchase_request_item_id' => $itemId,
            'uploaded_by' => $user->id,
            'type' => $validated['type'],
            'file_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType(),
            'size' => $file->getSize(),
        ]);

        app(\App\Services\AuditLogService::class)->log(
            'purchase_request.attachment_uploaded',
            'PurchaseRequestAttachment',
            $attachment->id,
            [],
            ['type' => $attachment->type],
            ['request_id' => $pr->id],
            $request,
        );

        return response()->json([
            'attachment' => [
                'id' => $attachment->id,
                'type' => $attachment->type,
                'url' => Storage::disk('public')->url($path),
            ],
        ], 201);
    }

    public function convertToPurchase(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::with('items')->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $purchase = $this->verification->convertToPurchase($pr, $user, $request);

        return response()->json(['purchase' => $purchase, 'request' => $this->formatRequest($pr->fresh(), $user, false)]);
    }

    public function convertToExpense(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::with(['items', 'attachments'])->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $expense = $this->verification->convertToExpense($pr, $user, $request);

        return response()->json(['expense' => $expense, 'request' => $this->formatRequest($pr->fresh(), $user, false)]);
    }

    public function autoExpenseSettings(): JsonResponse
    {
        return response()->json(['settings' => $this->verification->autoExpenseSettings()]);
    }

    public function updateAutoExpenseSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'auto_expense' => ['sometimes', 'boolean'],
            'default_expense_category_id' => ['sometimes', 'nullable', 'integer', 'exists:expense_categories,id'],
            'show_price_hints' => ['sometimes', 'boolean'],
            'auto_on_low_stock' => ['sometimes', 'boolean'],
            'auto_approve_under_mvr' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'auto_approve_under_laar' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'recurring_lists_enabled' => ['sometimes', 'boolean'],
        ]);

        return response()->json([
            'settings' => $this->verification->updateAutoExpenseSettings($validated),
            'message' => 'Purchase request expense settings saved.',
        ]);
    }

    public function reconciliation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'buyer_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $report = app(\App\Services\PurchaseRequestReconciliationService::class)->report(
            $validated['from'] ?? null,
            $validated['to'] ?? null,
            isset($validated['buyer_id']) ? (int) $validated['buyer_id'] : null,
        );

        return response()->json($report);
    }

    public function promoteToInventory(Request $request, int $id, int $itemId): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:50'],
            'category_id' => ['nullable', 'integer', 'exists:inventory_categories,id'],
            'reorder_point' => ['nullable', 'numeric', 'min:0'],
            'reorder_quantity' => ['nullable', 'numeric', 'min:0'],
        ]);

        $item = $this->findItem($id, $itemId);
        if (!$item->free_text_name && !$item->inventory_item_id) {
            return response()->json(['message' => 'Line has no free-text name to promote.'], 422);
        }

        /** @var User $user */
        $user = $request->user();
        $result = $this->service->promoteToInventory($item, $validated, $user, $request);
        $pr = PurchaseRequest::with(['items', 'requester', 'assignee'])->findOrFail($id);

        return response()->json([
            'item' => $this->formatItem($result['item'], $user, false),
            'inventory_item' => $result['inventory_item'],
            'created' => $result['created'],
            'request' => $this->formatRequest($pr, $user, false),
        ]);
    }

    public function merge(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['integer', 'exists:purchase_requests,id'],
        ]);
        $pr = PurchaseRequest::with('items')->findOrFail($id);
        /** @var User $user */
        $user = $request->user();
        $pr = $this->service->merge($pr, $validated['source_ids'], $user, $request);

        return response()->json(['request' => $this->formatRequest($pr, $user, false)]);
    }

    public function listQuotes(Request $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        /** @var User $user */
        $user = $request->user();
        $this->authorizeView($item->purchaseRequest, $user);

        return response()->json($this->formatQuotesPayload($item));
    }

    public function storeQuote(StorePurchaseRequestItemQuoteRequest $request, int $id, int $itemId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        /** @var User $user */
        $user = $request->user();
        $quote = $this->service->addQuote($item, $user, $request->validated(), $request);

        return response()->json([
            'quote' => $this->formatQuote($quote, $this->service->cheapestQuote($item)?->id),
            ...$this->formatQuotesPayload($item->fresh()),
        ], 201);
    }

    public function destroyQuote(Request $request, int $id, int $itemId, int $quoteId): JsonResponse
    {
        $item = $this->findItem($id, $itemId);
        $quote = PurchaseRequestItemQuote::query()
            ->where('purchase_request_item_id', $item->id)
            ->where('id', $quoteId)
            ->firstOrFail();
        /** @var User $user */
        $user = $request->user();
        $this->service->removeQuote($item, $quote, $user, $request);

        return response()->json($this->formatQuotesPayload($item->fresh()));
    }

    private function findItem(int $requestId, int $itemId): PurchaseRequestItem
    {
        return PurchaseRequestItem::where('purchase_request_id', $requestId)->where('id', $itemId)->firstOrFail();
    }

    /** @return array{quotes: list<array<string, mixed>>, cheapest_quote_id: int|null, price_hint: array<string, mixed>|null} */
    private function formatQuotesPayload(PurchaseRequestItem $item): array
    {
        $quotes = PurchaseRequestItemQuote::query()
            ->where('purchase_request_item_id', $item->id)
            ->with('supplier:id,name')
            ->orderBy('unit_price_laar')
            ->orderBy('id')
            ->get();
        $cheapestId = $quotes->first()?->id;

        $priceHint = null;
        if ($item->inventory_item_id) {
            $hints = app(PurchaseRequestPriceHintService::class)->hintsForItems([(int) $item->inventory_item_id]);
            $priceHint = $hints[(int) $item->inventory_item_id] ?? null;
        }

        return [
            'quotes' => $quotes->map(fn (PurchaseRequestItemQuote $q) => $this->formatQuote($q, $cheapestId))->values()->all(),
            'cheapest_quote_id' => $cheapestId,
            'price_hint' => $priceHint,
        ];
    }

    /** @return array<string, mixed> */
    private function formatQuote(PurchaseRequestItemQuote $quote, ?int $cheapestId): array
    {
        return [
            'id' => $quote->id,
            'purchase_request_item_id' => $quote->purchase_request_item_id,
            'supplier_id' => $quote->supplier_id,
            'supplier_name' => $quote->supplier?->name ?? $quote->supplier_name_text,
            'supplier_name_text' => $quote->supplier_name_text,
            'unit_price_laar' => $quote->unit_price_laar,
            'unit' => $quote->unit,
            'note' => $quote->note,
            'quoted_by' => $quote->quoted_by,
            'selected_at' => $quote->selected_at?->toIso8601String(),
            'savings_laar' => $quote->savings_laar,
            'is_cheapest' => $cheapestId !== null && (int) $quote->id === (int) $cheapestId,
            'created_at' => $quote->created_at?->toIso8601String(),
        ];
    }

    private function authorizeView(PurchaseRequest $pr, User $user): void
    {
        if (!$this->service->canView($pr, $user)) {
            abort(403);
        }
    }

    /** @return list<string>|null */
    private function parseStatuses(?string $raw): ?array
    {
        if (!$raw) {
            return null;
        }

        return array_values(array_filter(explode(',', $raw)));
    }

    private function formatRequest(PurchaseRequest $pr, User $user, bool $staffView): array
    {
        $pr->loadMissing([
            'requester',
            'assignee',
            'items.inventoryItem',
            'items.menuItem',
            'purchase:id,purchase_number',
            'expense:id,expense_number',
        ]);

        $priceHints = app(PurchaseRequestPriceHintService::class)->hintsForItems(
            $pr->items->pluck('inventory_item_id')->filter()->map(fn ($id) => (int) $id)->all(),
        );

        $payload = [
            'id' => $pr->id,
            'request_no' => $pr->request_no,
            'title' => $pr->title,
            'source' => $pr->source,
            'status' => $pr->status,
            'priority' => $pr->priority,
            'needed_by' => $pr->needed_by?->toIso8601String(),
            'notes' => $pr->notes,
            'rejection_reason' => $pr->rejection_reason,
            'requested_by' => $pr->requested_by,
            'requester' => $pr->requester ? ['id' => $pr->requester->id, 'name' => $pr->requester->name] : null,
            'assigned_to' => $pr->assigned_to,
            'assignee' => $pr->assignee ? ['id' => $pr->assignee->id, 'name' => $pr->assignee->name] : null,
            'purchase_id' => $pr->purchase_id,
            'purchase' => $pr->purchase ? [
                'id' => $pr->purchase->id,
                'purchase_number' => $pr->purchase->purchase_number,
            ] : null,
            'expense_id' => $pr->expense_id,
            'expense' => $pr->expense ? [
                'id' => $pr->expense->id,
                'expense_number' => $pr->expense->expense_number,
            ] : null,
            'created_at' => $pr->created_at?->toIso8601String(),
            'updated_at' => $pr->updated_at?->toIso8601String(),
            'items' => $pr->items->map(fn (PurchaseRequestItem $i) => $this->formatItem($i, $user, $staffView, $priceHints))->values()->all(),
        ];

        if (!$staffView) {
            $payload['total_estimated_laar'] = $pr->total_estimated_laar;
            $payload['total_actual_laar'] = $pr->total_actual_laar;
        }

        return $payload;
    }

    /** @param array<int, array<string, mixed>> $priceHints */
    private function formatItem(PurchaseRequestItem $item, User $user, bool $staffView, array $priceHints = []): array
    {
        $payload = [
            'id' => $item->id,
            'inventory_item_id' => $item->inventory_item_id,
            'menu_item_id' => $item->menu_item_id,
            'name' => $item->displayName(),
            'free_text_name' => $item->free_text_name,
            'category' => $item->category,
            'requested_qty' => (float) $item->requested_qty,
            'requested_unit' => $item->requested_unit,
            'approved_qty' => $item->approved_qty !== null ? (float) $item->approved_qty : null,
            'actual_qty' => $item->actual_qty !== null ? (float) $item->actual_qty : null,
            'actual_unit' => $item->actual_unit,
            'status' => $item->status,
            'reason' => $item->reason,
            'notes' => $item->notes,
            'buyer_notes' => $item->buyer_notes,
            'supplier_name_text' => $item->supplier_name_text,
            'bought_at' => $item->bought_at?->toIso8601String(),
            'received_at' => $item->received_at?->toIso8601String(),
        ];

        if ($item->inventory_item_id && isset($priceHints[$item->inventory_item_id])) {
            $payload['price_hint'] = $priceHints[$item->inventory_item_id];
        }

        if (!$staffView) {
            $payload['estimated_unit_cost_laar'] = $item->estimated_unit_cost_laar;
            $payload['actual_unit_cost_laar'] = $item->actual_unit_cost_laar;
            $payload['actual_total_laar'] = $item->actual_total_laar;
            $payload['supplier_id'] = $item->supplier_id;
            $payload['verified_notes'] = $item->verified_notes;
        }

        return $payload;
    }
}
