<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\Variant;
use App\Services\SpecialPricingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EventOrderController extends Controller
{
    public function __construct(
        private readonly SpecialPricingService $specialPricing,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $leadHours = max(0, (int) SiteSetting::get('catering_min_lead_hours', '24'));
        $minDate = now()->addHours($leadHours)->startOfDay()->toDateString();

        $validated = $request->validate([
            'company' => ['nullable', 'string', 'max:200'],
            'occasion' => ['nullable', 'string', 'in:' . implode(',', CateringRequest::OCCASIONS)],
            'event_type' => ['nullable', 'string', 'max:80'],
            'contact_name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:190'],
            'event_date' => ['required', 'date', 'after_or_equal:' . $minDate],
            'fulfillment_method' => ['required', 'string', Rule::in(CateringRequest::FULFILLMENT_METHODS)],
            'fulfillment_time' => ['nullable', 'date_format:H:i'],
            'setup_time' => ['nullable', 'date_format:H:i'],
            'venue_name' => ['nullable', 'string', 'max:160'],
            'delivery_address' => ['nullable', 'string', 'max:500'],
            'delivery_island' => ['nullable', 'string', 'max:80'],
            'onsite_contact_name' => ['nullable', 'string', 'max:120'],
            'onsite_contact_phone' => ['nullable', 'string', 'max:32'],
            'headcount' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'dietary_notes' => ['nullable', 'string', 'max:1000'],
            'lines' => ['required', 'array', 'min:1', 'max:80'],
            'lines.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'lines.*.variant_id' => ['nullable', 'integer', 'exists:variants,id'],
            'lines.*.custom_name' => ['nullable', 'string', 'max:160'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:5000'],
            'lines.*.notes' => ['nullable', 'string', 'max:500'],
            'lines.*.unit_price' => ['prohibited'],
            'lines.*.price' => ['prohibited'],
        ]);

        if (($validated['fulfillment_method'] ?? 'pickup') === 'delivery') {
            if (blank($validated['delivery_address'] ?? null) || blank($validated['delivery_island'] ?? null)) {
                throw ValidationException::withMessages([
                    'delivery_address' => ['Delivery address and island are required for delivery events.'],
                    'delivery_island' => ['Delivery address and island are required for delivery events.'],
                ]);
            }
        }

        $resolvedLines = $this->resolveLines($validated['lines']);

        $row = DB::transaction(function () use ($validated, $customer, $resolvedLines) {
            $row = CateringRequest::create([
                'customer_id' => $customer->id,
                'reference' => CateringRequest::generateReference(),
                'company' => $validated['company'] ?? null,
                'occasion' => $validated['occasion'] ?? (($validated['event_type'] ?? null) ? 'event' : 'other'),
                'event_type' => $validated['event_type'] ?? null,
                'contact_name' => $validated['contact_name'],
                'phone' => $validated['phone'],
                'email' => $validated['email'] ?? $customer->email,
                'event_date' => $validated['event_date'],
                'fulfillment_method' => $validated['fulfillment_method'],
                'fulfillment_time' => $validated['fulfillment_time'] ?? null,
                'setup_time' => $validated['setup_time'] ?? null,
                'venue_name' => $validated['venue_name'] ?? null,
                'delivery_address' => $validated['delivery_address'] ?? null,
                'delivery_island' => $validated['delivery_island'] ?? null,
                'onsite_contact_name' => $validated['onsite_contact_name'] ?? $validated['contact_name'],
                'onsite_contact_phone' => $validated['onsite_contact_phone'] ?? $validated['phone'],
                'headcount' => $validated['headcount'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'dietary_notes' => $validated['dietary_notes'] ?? null,
                'status' => 'draft',
                'source' => 'event_wizard',
            ]);

            foreach ($resolvedLines as $i => $line) {
                CateringRequestLine::create([
                    'catering_request_id' => $row->id,
                    'item_id' => $line['item_id'],
                    'variant_id' => $line['variant_id'],
                    'name' => $line['name'],
                    'quantity' => $line['quantity'],
                    'unit_price' => $line['unit_price'],
                    'notes' => $line['notes'],
                    'is_custom' => $line['is_custom'],
                    'sort_order' => $i,
                ]);
            }

            return $row->load('lines');
        });

        event(new CateringRequestSubmitted($row));

        return response()->json([
            'message' => 'Event request received — we will send your quote soon.',
            'request' => $this->formatDraft($row),
        ], 201);
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{item_id:?int,variant_id:?int,name:string,quantity:int,unit_price:?float,notes:?string,is_custom:bool}>
     */
    private function resolveLines(array $lines): array
    {
        $out = [];
        foreach ($lines as $i => $line) {
            $qty = (int) $line['quantity'];
            $notes = isset($line['notes']) ? (string) $line['notes'] : null;
            $itemId = isset($line['item_id']) ? (int) $line['item_id'] : null;
            $customName = isset($line['custom_name']) ? trim((string) $line['custom_name']) : '';

            if ($itemId) {
                $item = Item::query()->with('variants')->find($itemId);
                if (!$item || !$item->is_active) {
                    throw ValidationException::withMessages([
                        "lines.{$i}.item_id" => ['Item is not available.'],
                    ]);
                }

                $variantId = isset($line['variant_id']) ? (int) $line['variant_id'] : null;
                $variant = null;
                if ($variantId) {
                    $variant = Variant::query()
                        ->where('id', $variantId)
                        ->where('item_id', $item->id)
                        ->where('is_active', true)
                        ->first();
                    if (!$variant) {
                        throw ValidationException::withMessages([
                            "lines.{$i}.variant_id" => ['Variant is not available for this item.'],
                        ]);
                    }
                } elseif ($item->has_variants) {
                    throw ValidationException::withMessages([
                        "lines.{$i}.variant_id" => ['A variant is required for this item.'],
                    ]);
                }

                $catalogPrice = $variant ? (float) $variant->price : (float) $item->base_price;
                $pricing = $this->specialPricing->resolveUnitPrice($item->id, $catalogPrice, $item, $variant?->id);
                $name = $item->name . ($variant ? (' — ' . $variant->name) : '');

                $out[] = [
                    'item_id' => $item->id,
                    'variant_id' => $variant?->id,
                    'name' => mb_substr($name, 0, 160),
                    'quantity' => $qty,
                    'unit_price' => round($pricing->unitPrice, 2),
                    'notes' => $notes,
                    'is_custom' => false,
                ];
                continue;
            }

            if ($customName === '') {
                throw ValidationException::withMessages([
                    "lines.{$i}" => ['Each line needs item_id or custom_name.'],
                ]);
            }

            $out[] = [
                'item_id' => null,
                'variant_id' => null,
                'name' => mb_substr($customName, 0, 160),
                'quantity' => $qty,
                'unit_price' => null,
                'notes' => $notes,
                'is_custom' => true,
            ];
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function formatDraft(CateringRequest $row): array
    {
        return [
            'id' => $row->id,
            'reference' => $row->reference,
            'status' => $row->status,
            'event_date' => $row->event_date?->toDateString(),
            'fulfillment_method' => $row->fulfillment_method,
            'fulfillment_time' => $row->fulfillment_time
                ? Carbon::parse($row->fulfillment_time)->format('H:i')
                : null,
            'venue_name' => $row->venue_name,
            'headcount' => $row->headcount,
            'lines' => $row->lines->map(fn (CateringRequestLine $l) => [
                'id' => $l->id,
                'item_id' => $l->item_id,
                'variant_id' => $l->variant_id,
                'name' => $l->name,
                'quantity' => $l->quantity,
                'unit_price' => $l->unit_price !== null ? (float) $l->unit_price : null,
                'notes' => $l->notes,
                'is_custom' => (bool) $l->is_custom,
            ])->values()->all(),
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
