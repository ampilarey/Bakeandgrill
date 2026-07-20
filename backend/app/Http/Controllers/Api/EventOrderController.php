<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catering\Events\CateringRequestSubmitted;
use App\Domains\Orders\Services\PackagingOptionResolver;
use App\Http\Controllers\Controller;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\Variant;
use App\Services\SpecialPricingService;
use App\Support\DeferAfterResponse;
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
        private readonly PackagingOptionResolver $packagingResolver = new PackagingOptionResolver,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $rows = CateringRequest::query()
            ->with(['lines', 'posOrder'])
            ->where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'data' => $rows->map(fn (CateringRequest $row) => $this->formatCustomerEvent($row))->values()->all(),
        ]);
    }

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
            // Optional — wizard uses the authenticated customer; staff/API may still send overrides.
            'contact_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:190'],
            'event_date' => ['required', 'date', 'after_or_equal:' . $minDate],
            // Defaults to pickup; delivery address is collected later (quote / after payment).
            'fulfillment_method' => ['nullable', 'string', Rule::in(CateringRequest::FULFILLMENT_METHODS)],
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
            'lines.*.packaging_option_id' => ['nullable', 'integer', 'exists:item_packaging_options,id'],
            'lines.*.custom_name' => ['nullable', 'string', 'max:160'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:5000'],
            'lines.*.notes' => ['nullable', 'string', 'max:500'],
            'lines.*.unit_price' => ['prohibited'],
            'lines.*.price' => ['prohibited'],
        ]);

        $fulfillmentMethod = $validated['fulfillment_method'] ?? 'pickup';
        if ($fulfillmentMethod === 'delivery') {
            if (blank($validated['delivery_address'] ?? null) || blank($validated['delivery_island'] ?? null)) {
                throw ValidationException::withMessages([
                    'delivery_address' => ['Delivery address and island are required for delivery events.'],
                    'delivery_island' => ['Delivery address and island are required for delivery events.'],
                ]);
            }
        }

        $contactName = trim((string) ($validated['contact_name'] ?? ''));
        if ($contactName === '') {
            $contactName = trim((string) ($customer->name ?? ''));
        }
        if ($contactName === '') {
            $contactName = preg_replace('/^\+?960/', '', (string) $customer->phone) ?: 'Customer';
        }

        $phone = trim((string) ($validated['phone'] ?? ''));
        if ($phone === '') {
            $phone = (string) $customer->phone;
        }

        $resolvedLines = $this->resolveLines($validated['lines']);

        $row = DB::transaction(function () use ($validated, $customer, $resolvedLines, $fulfillmentMethod, $contactName, $phone) {
            $row = CateringRequest::create([
                'customer_id' => $customer->id,
                'reference' => CateringRequest::generateReference(),
                'company' => $validated['company'] ?? null,
                'occasion' => $validated['occasion'] ?? (($validated['event_type'] ?? null) ? 'event' : 'other'),
                'event_type' => $validated['event_type'] ?? null,
                'contact_name' => $contactName,
                'phone' => $phone,
                'email' => $validated['email'] ?? $customer->email,
                'event_date' => $validated['event_date'],
                'fulfillment_method' => $fulfillmentMethod,
                'fulfillment_time' => $validated['fulfillment_time'] ?? null,
                'setup_time' => $validated['setup_time'] ?? null,
                'venue_name' => $validated['venue_name'] ?? null,
                'delivery_address' => $validated['delivery_address'] ?? null,
                'delivery_island' => $validated['delivery_island'] ?? null,
                'onsite_contact_name' => $validated['onsite_contact_name'] ?? $contactName,
                'onsite_contact_phone' => $validated['onsite_contact_phone'] ?? $phone,
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
                    'packaging_option_id' => $line['packaging_option_id'],
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

        $requestId = (int) $row->id;
        DeferAfterResponse::run(function () use ($requestId): void {
            $fresh = CateringRequest::query()->with('lines')->find($requestId);
            if ($fresh) {
                event(new CateringRequestSubmitted($fresh));
            }
        }, 'event-order-created-notify');

        return response()->json([
            'message' => 'Event request received — we will send your quote soon.',
            'request' => $this->formatDraft($row),
        ], 201);
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{item_id:?int,variant_id:?int,packaging_option_id:?int,name:string,quantity:int,unit_price:?float,notes:?string,is_custom:bool}>
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
                $item = Item::query()->with(['variants', 'packagingOptions'])->find($itemId);
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

                $packagingOptionId = array_key_exists('packaging_option_id', $line) && $line['packaging_option_id'] !== null
                    ? (int) $line['packaging_option_id']
                    : null;
                try {
                    $packaging = $this->packagingResolver->resolve($item, $packagingOptionId);
                } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                    throw ValidationException::withMessages([
                        "lines.{$i}.packaging_option_id" => [$e->getMessage() ?: 'Invalid packaging option for this item.'],
                    ]);
                }

                $catalogPrice = $variant ? (float) $variant->price : (float) $item->base_price;
                $pricing = $this->specialPricing->resolveUnitPrice($item->id, $catalogPrice, $item, $variant?->id);
                $name = $item->name . ($variant ? (' — ' . $variant->name) : '');

                $out[] = [
                    'item_id' => $item->id,
                    'variant_id' => $variant?->id,
                    'packaging_option_id' => $packaging['packaging_option_id'],
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
                'packaging_option_id' => null,
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
                'packaging_option_id' => $l->packaging_option_id,
                'name' => $l->name,
                'quantity' => $l->quantity,
                'unit_price' => $l->unit_price !== null ? (float) $l->unit_price : null,
                'notes' => $l->notes,
                'is_custom' => (bool) $l->is_custom,
            ])->values()->all(),
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function formatCustomerEvent(CateringRequest $row): array
    {
        $order = $row->relationLoaded('posOrder') ? $row->posOrder : null;
        $paidLaar = 0;
        $totalLaar = 0;
        if ($order) {
            $totalLaar = (int) ($order->total_laar ?? 0);
            $paidLaar = (int) \App\Models\Payment::query()
                ->where('order_id', $order->id)
                ->whereIn('status', ['confirmed', 'paid', 'completed'])
                ->sum('amount_laar');
        }

        return [
            'reference' => $row->reference,
            'status' => $row->status,
            'event_date' => $row->event_date?->toDateString(),
            'fulfillment_method' => $row->fulfillment_method,
            'fulfillment_time' => $row->fulfillment_time
                ? Carbon::parse($row->fulfillment_time)->format('H:i')
                : null,
            'venue_name' => $row->venue_name,
            'headcount' => $row->headcount,
            'quote_token' => $row->status === 'awaiting_customer' ? $row->quote_token : null,
            'quote_is_deposit' => (bool) $row->quote_is_deposit,
            'paid_laar' => $paidLaar,
            'balance_laar' => max(0, $totalLaar - $paidLaar),
            'total_laar' => $totalLaar,
            'created_at' => $row->created_at?->toIso8601String(),
        ];
    }
}
