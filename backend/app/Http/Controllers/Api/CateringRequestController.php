<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Catering\Services\CateringNotifyRecipients;
use App\Domains\Catering\Services\CateringQuoteService;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Services\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CateringRequestController extends Controller
{
    public function __construct(
        private readonly CateringQuoteService $quotes,
        private readonly CateringNotifyRecipients $recipients,
        private readonly AuditLogService $audit,
    ) {}

    public function store(Request $request): JsonResponse
    {
        if ($request->filled('website')) {
            // Honeypot — pretend success.
            return response()->json(['message' => 'Thanks — we will contact you shortly.'], 201);
        }

        $leadHours = max(0, (int) SiteSetting::get('catering_min_lead_hours', '24'));
        $minDate = now()->addHours($leadHours)->startOfDay()->toDateString();

        $validated = $request->validate([
            'company' => ['nullable', 'string', 'max:200'],
            'occasion' => ['required', 'string', 'in:' . implode(',', CateringRequest::OCCASIONS)],
            'contact_name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:190'],
            'event_date' => ['required', 'date', 'after_or_equal:' . $minDate],
            'headcount' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'interested_items' => ['nullable', 'array', 'max:40'],
            'interested_items.*' => ['integer', 'exists:items,id'],
        ]);

        $itemIds = array_values(array_unique(array_map('intval', $validated['interested_items'] ?? [])));

        $row = CateringRequest::create([
            'company' => $validated['company'] ?? null,
            'occasion' => $validated['occasion'],
            'contact_name' => $validated['contact_name'],
            'phone' => $validated['phone'],
            'email' => $validated['email'] ?? null,
            'event_date' => $validated['event_date'],
            'headcount' => $validated['headcount'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'interested_items' => $itemIds !== [] ? $itemIds : null,
            'status' => 'new',
            'source' => 'web',
        ]);

        event(new CateringRequestSubmitted($row));

        return response()->json([
            'message' => 'Thanks — we will contact you shortly.',
            'request' => [
                'id' => $row->id,
                'created_at' => $row->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $query = CateringRequest::query()
            ->with(['handler:id,name'])
            ->withCount([
                'lines',
                'lines as custom_lines_count' => fn ($q) => $q->where('is_custom', true),
            ])
            ->orderByDesc('created_at');

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        if ($request->boolean('assigned_to_me') && $request->user()) {
            $query->where('handled_by', $request->user()->id);
        }

        if ($request->filled('q')) {
            $q = trim((string) $request->input('q'));
            if ($q !== '') {
                $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
                $query->where(function ($builder) use ($like, $q) {
                    $builder->where('contact_name', 'like', $like)
                        ->orWhere('phone', 'like', $like)
                        ->orWhere('company', 'like', $like)
                        ->orWhere('reference', 'like', $like)
                        ->orWhere('email', 'like', $like);
                    $digits = preg_replace('/\D+/', '', $q) ?? '';
                    if ($digits !== '') {
                        $builder->orWhere('phone', 'like', '%' . $digits . '%');
                    }
                });
            }
        }

        $paginator = $query->paginate(min(50, max(10, (int) $request->input('per_page', 20))));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (CateringRequest $row) => $this->format($row)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function adminShow(int $id): JsonResponse
    {
        $row = CateringRequest::query()
            ->with(['lines', 'handler:id,name'])
            ->withCount([
                'lines',
                'lines as custom_lines_count' => fn ($q) => $q->where('is_custom', true),
            ])
            ->findOrFail($id);

        $payload = $this->format($row, true);
        $payload['tax_preview'] = $this->quotes->taxPreview($row);
        $payload['assignees'] = $this->recipients->eventsManageStaff();

        return response()->json(['request' => $payload]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'string', 'in:' . implode(',', CateringRequest::STATUSES)],
            'quoted_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'staff_notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'pos_order_id' => ['sometimes', 'nullable', 'integer', 'exists:orders,id'],
            'handled_by' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'company' => ['sometimes', 'nullable', 'string', 'max:200'],
            'occasion' => ['sometimes', 'nullable', 'string', 'in:' . implode(',', CateringRequest::OCCASIONS)],
            'event_type' => ['sometimes', 'nullable', 'string', 'max:120'],
            'contact_name' => ['sometimes', 'string', 'max:120'],
            'phone' => ['sometimes', 'string', 'max:32'],
            'email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'event_date' => ['sometimes', 'nullable', 'date'],
            'fulfillment_method' => ['sometimes', 'string', 'in:' . implode(',', CateringRequest::FULFILLMENT_METHODS)],
            'fulfillment_time' => ['sometimes', 'nullable', 'date_format:H:i'],
            'setup_time' => ['sometimes', 'nullable', 'date_format:H:i'],
            'venue_name' => ['sometimes', 'nullable', 'string', 'max:160'],
            'delivery_address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'delivery_island' => ['sometimes', 'nullable', 'string', 'max:80'],
            'onsite_contact_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'onsite_contact_phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'headcount' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:5000'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'dietary_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'fulfillment_options' => ['sometimes', 'nullable', 'array'],
        ]);

        $row = CateringRequest::query()->findOrFail($id);
        $oldHandledBy = $row->handled_by;
        $updates = $validated;

        if (isset($validated['status'])) {
            $now = Carbon::now();
            if ($validated['status'] === 'contacted' && $row->contacted_at === null) {
                $updates['contacted_at'] = $now;
            }
            if ($validated['status'] === 'quoted' && $row->quoted_at === null) {
                $updates['quoted_at'] = $now;
            }
            if ($validated['status'] === 'confirmed' && $row->confirmed_at === null) {
                $updates['confirmed_at'] = $now;
            }
        }

        // Auto-assign on first staff action when not explicitly setting handled_by.
        if (!array_key_exists('handled_by', $updates) && $request->user() && $row->handled_by === null) {
            $updates['handled_by'] = $request->user()->id;
        }

        $row->update($updates);
        $row = $row->fresh(['lines', 'handler:id,name']);

        if (array_key_exists('handled_by', $validated) && (int) $oldHandledBy !== (int) $row->handled_by) {
            $this->audit->log(
                'catering.assigned',
                'CateringRequest',
                $row->id,
                ['handled_by' => $oldHandledBy],
                ['handled_by' => $row->handled_by],
                [],
                $request,
            );
        } elseif (!empty($validated)) {
            $this->audit->log(
                'catering.updated',
                'CateringRequest',
                $row->id,
                [],
                array_intersect_key($validated, array_flip(array_keys($validated))),
                [],
                $request,
            );
        }

        $payload = $this->format($row, true);
        $payload['tax_preview'] = $this->quotes->taxPreview($row);
        $payload['assignees'] = $this->recipients->eventsManageStaff();

        return response()->json(['request' => $payload]);
    }

    public function replaceLines(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'lines' => ['required', 'array', 'min:1', 'max:80'],
            'lines.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'lines.*.variant_id' => ['nullable', 'integer', 'exists:variants,id'],
            'lines.*.custom_name' => ['nullable', 'string', 'max:160'],
            'lines.*.name' => ['nullable', 'string', 'max:160'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:5000'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.notes' => ['nullable', 'string', 'max:500'],
            'lines.*.is_custom' => ['nullable', 'boolean'],
            'lines.*.price_needs_review' => ['nullable', 'boolean'],
        ]);

        $row = CateringRequest::query()->findOrFail($id);
        $actor = $request->user();
        $updated = $this->quotes->replaceLines($row, $validated['lines'], $actor);

        $payload = $this->format($updated, true);
        $payload['tax_preview'] = $this->quotes->taxPreview($updated);
        $payload['assignees'] = $this->recipients->eventsManageStaff();

        return response()->json(['request' => $payload]);
    }

    public function sendQuote(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_amount_mvr' => ['required', 'numeric'],
            'is_deposit' => ['sometimes', 'boolean'],
        ]);

        $row = CateringRequest::query()->with('lines')->findOrFail($id);
        $updated = $this->quotes->sendQuote($row, $validated, $request->user());

        $payload = $this->format($updated, true);
        $payload['tax_preview'] = $this->quotes->taxPreview($updated);
        $payload['assignees'] = $this->recipients->eventsManageStaff();
        $payload['quote_url'] = rtrim((string) config('app.url'), '/') . '/order/quote/' . $updated->quote_token;

        return response()->json(['request' => $payload]);
    }

    public function duplicate(Request $request, int $id): JsonResponse
    {
        $source = CateringRequest::query()->with('lines')->findOrFail($id);
        $copy = $this->quotes->duplicate($source, $request->user());

        $payload = $this->format($copy, true);
        $payload['tax_preview'] = $this->quotes->taxPreview($copy);
        $payload['assignees'] = $this->recipients->eventsManageStaff();

        return response()->json(['request' => $payload], 201);
    }

    /** @return array<string, mixed> */
    private function format(CateringRequest $row, bool $withLines = false): array
    {
        $interested = is_array($row->interested_items) ? $row->interested_items : [];
        $itemNames = [];
        if ($interested !== []) {
            $itemNames = Item::query()
                ->whereIn('id', $interested)
                ->pluck('name', 'id')
                ->all();
        }

        $payload = [
            'id' => $row->id,
            'customer_id' => $row->customer_id,
            'reference' => $row->reference,
            'company' => $row->company,
            'occasion' => $row->occasion,
            'event_type' => $row->event_type,
            'contact_name' => $row->contact_name,
            'phone' => $row->phone,
            'email' => $row->email,
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
            'notes' => $row->notes,
            'dietary_notes' => $row->dietary_notes,
            'fulfillment_options' => $row->fulfillment_options,
            'interested_items' => $interested,
            'interested_item_names' => collect($interested)
                ->map(fn ($id) => ['id' => (int) $id, 'name' => $itemNames[(int) $id] ?? ('#' . $id)])
                ->values()
                ->all(),
            'lines_count' => (int) ($row->lines_count ?? $row->lines()->count()),
            'custom_lines_count' => (int) ($row->custom_lines_count ?? $row->lines()->where('is_custom', true)->count()),
            'staff_notes' => $row->staff_notes,
            'quoted_amount' => $row->quoted_amount !== null ? (float) $row->quoted_amount : null,
            'quote_subtotal_laar' => $row->quote_subtotal_laar !== null ? (int) $row->quote_subtotal_laar : null,
            'quote_payment_laar' => $row->quote_payment_laar !== null ? (int) $row->quote_payment_laar : null,
            'quote_is_deposit' => (bool) $row->quote_is_deposit,
            'quote_version' => (int) ($row->quote_version ?? 1),
            'quote_sent_at' => $row->quote_sent_at?->toIso8601String(),
            'quote_expires_at' => $row->quote_expires_at?->toIso8601String(),
            'has_live_quote' => $row->quote_token !== null && $row->status === 'awaiting_customer',
            'pos_order_id' => $row->pos_order_id,
            'handled_by' => $row->handled_by,
            'handled_by_name' => $row->relationLoaded('handler') ? ($row->handler?->name) : null,
            'contacted_at' => $row->contacted_at?->toIso8601String(),
            'quoted_at' => $row->quoted_at?->toIso8601String(),
            'confirmed_at' => $row->confirmed_at?->toIso8601String(),
            'status' => $row->status,
            'source' => $row->source,
            'created_at' => $row->created_at?->toIso8601String(),
        ];

        if ($withLines || $row->relationLoaded('lines')) {
            $payload['lines'] = $row->lines->map(fn ($l) => [
                'id' => $l->id,
                'item_id' => $l->item_id,
                'variant_id' => $l->variant_id,
                'name' => $l->name,
                'quantity' => $l->quantity,
                'unit_price' => $l->unit_price !== null ? (float) $l->unit_price : null,
                'notes' => $l->notes,
                'is_custom' => (bool) $l->is_custom,
                'price_needs_review' => (bool) ($l->price_needs_review ?? false),
                'sort_order' => $l->sort_order,
            ])->values()->all();
        }

        return $payload;
    }
}
