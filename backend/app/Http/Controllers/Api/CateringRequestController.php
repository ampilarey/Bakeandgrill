<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use App\Models\Item;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CateringRequestController extends Controller
{
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
        $query = CateringRequest::query()->orderByDesc('created_at');

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
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

    public function update(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', 'string', 'in:' . implode(',', CateringRequest::STATUSES)],
            'quoted_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'staff_notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'pos_order_id' => ['sometimes', 'nullable', 'integer', 'exists:orders,id'],
            'handled_by' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ]);

        $row = CateringRequest::query()->findOrFail($id);
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

        if (!array_key_exists('handled_by', $updates) && $request->user()) {
            $updates['handled_by'] = $request->user()->id;
        }

        $row->update($updates);

        return response()->json(['request' => $this->format($row->fresh())]);
    }

    /** @return array<string, mixed> */
    private function format(CateringRequest $row): array
    {
        $interested = is_array($row->interested_items) ? $row->interested_items : [];
        $itemNames = [];
        if ($interested !== []) {
            $itemNames = Item::query()
                ->whereIn('id', $interested)
                ->pluck('name', 'id')
                ->all();
        }

        return [
            'id' => $row->id,
            'company' => $row->company,
            'occasion' => $row->occasion,
            'contact_name' => $row->contact_name,
            'phone' => $row->phone,
            'email' => $row->email,
            'event_date' => $row->event_date?->toDateString(),
            'headcount' => $row->headcount,
            'notes' => $row->notes,
            'interested_items' => $interested,
            'interested_item_names' => collect($interested)
                ->map(fn ($id) => ['id' => (int) $id, 'name' => $itemNames[(int) $id] ?? ('#' . $id)])
                ->values()
                ->all(),
            'staff_notes' => $row->staff_notes,
            'quoted_amount' => $row->quoted_amount !== null ? (float) $row->quoted_amount : null,
            'pos_order_id' => $row->pos_order_id,
            'handled_by' => $row->handled_by,
            'contacted_at' => $row->contacted_at?->toIso8601String(),
            'quoted_at' => $row->quoted_at?->toIso8601String(),
            'confirmed_at' => $row->confirmed_at?->toIso8601String(),
            'status' => $row->status,
            'source' => $row->source,
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
