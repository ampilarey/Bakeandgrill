<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Trade\Services\TradePriceResolver;
use App\Models\Customer;
use App\Models\Item;
use App\Models\TradeAccount;
use App\Models\TradePriceListEntry;
use App\Models\Variant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

/**
 * Stage A wholesale admin API — trade accounts + price lists.
 * See docs/WHOLESALE_CONSIGNMENT_PLAN.md §3.1–3.2.
 */
class TradeAccountController extends Controller
{
    public function __construct(
        private readonly TradePriceResolver $priceResolver,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = TradeAccount::query()
            ->with(['customer:id,name,phone,credit_enabled,credit_status,credit_limit_laar,credit_balance_laar'])
            ->orderBy('shop_name');

        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('shop_name', 'like', "%{$search}%")
                    ->orWhere('contact_name', 'like', "%{$search}%")
                    ->orWhere('contact_phone', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($cq) use ($search) {
                        $cq->where('name', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->has('active')) {
            $active = filter_var($request->query('active'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($active !== null) {
                $query->where('is_active', $active);
            }
        }

        $paginator = $query->paginate((int) $request->query('per_page', 50));

        return response()->json([
            'data' => collect($paginator->items())->map(fn (TradeAccount $a) => $this->formatAccount($a)),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $account = TradeAccount::with([
            'customer:id,name,phone,credit_enabled,credit_status,credit_limit_laar,credit_balance_laar,credit_payment_terms_days',
        ])->findOrFail($id);

        return response()->json([
            'trade_account' => $this->formatAccount($account, detailed: true),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateAccount($request);

        if (TradeAccount::where('customer_id', $validated['customer_id'])->exists()) {
            return response()->json([
                'message' => 'This customer already has a trade account.',
                'errors' => ['customer_id' => ['A trade account already exists for this customer.']],
            ], 422);
        }

        $account = TradeAccount::create($validated);
        $account->load('customer:id,name,phone,credit_enabled,credit_status,credit_limit_laar,credit_balance_laar,credit_payment_terms_days');

        return response()->json([
            'trade_account' => $this->formatAccount($account, detailed: true),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);
        $validated = $this->validateAccount($request, updating: true);

        // customer_id is immutable after create — one account per customer forever.
        unset($validated['customer_id']);

        $account->update($validated);
        $account->load('customer:id,name,phone,credit_enabled,credit_status,credit_limit_laar,credit_balance_laar,credit_payment_terms_days');

        return response()->json([
            'trade_account' => $this->formatAccount($account, detailed: true),
        ]);
    }

    public function deactivate(int $id): JsonResponse
    {
        $account = TradeAccount::with([
            'customer:id,name,phone,credit_enabled,credit_status,credit_limit_laar,credit_balance_laar,credit_payment_terms_days',
        ])->findOrFail($id);

        $account->update(['is_active' => false]);

        return response()->json([
            'trade_account' => $this->formatAccount($account->fresh()->load('customer'), detailed: true),
        ]);
    }

    public function priceIndex(int $id): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);

        $entries = TradePriceListEntry::query()
            ->where('trade_account_id', $account->id)
            ->with(['item:id,name,sku,base_price,wholesale_price_laar', 'variant:id,name,price'])
            ->orderBy('item_id')
            ->get()
            ->map(fn (TradePriceListEntry $e) => $this->formatPriceEntry($e));

        return response()->json(['data' => $entries]);
    }

    public function priceStore(Request $request, int $id): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);
        $validated = $this->validatePriceEntry($request);

        $exists = TradePriceListEntry::query()
            ->where('trade_account_id', $account->id)
            ->where('item_id', $validated['item_id'])
            ->when(
                isset($validated['variant_id']) && $validated['variant_id'] !== null,
                fn ($q) => $q->where('variant_id', $validated['variant_id']),
                fn ($q) => $q->whereNull('variant_id'),
            )
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'A price already exists for this item on this account.',
                'errors' => ['item_id' => ['Duplicate price list entry.']],
            ], 422);
        }

        $entry = TradePriceListEntry::create([
            'trade_account_id' => $account->id,
            'item_id' => $validated['item_id'],
            'variant_id' => $validated['variant_id'] ?? null,
            'price_laar' => $validated['price_laar'],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $entry->load(['item:id,name,sku,base_price,wholesale_price_laar', 'variant:id,name,price']);

        return response()->json(['price_entry' => $this->formatPriceEntry($entry)], 201);
    }

    public function priceUpdate(Request $request, int $id, int $entryId): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);
        $entry = TradePriceListEntry::where('trade_account_id', $account->id)->findOrFail($entryId);

        $validated = $request->validate([
            'price_laar' => ['sometimes', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'variant_id' => ['sometimes', 'nullable', 'integer', 'exists:variants,id'],
        ]);

        $entry->update($validated);
        $entry->load(['item:id,name,sku,base_price,wholesale_price_laar', 'variant:id,name,price']);

        return response()->json(['price_entry' => $this->formatPriceEntry($entry)]);
    }

    public function priceDestroy(int $id, int $entryId): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);
        $entry = TradePriceListEntry::where('trade_account_id', $account->id)->findOrFail($entryId);
        $entry->delete();

        return response()->json(['ok' => true]);
    }

    public function pricePreview(Request $request, int $id): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);

        $validated = $request->validate([
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'variant_id' => ['nullable', 'integer', 'exists:variants,id'],
        ]);

        $item = Item::findOrFail($validated['item_id']);
        $variant = isset($validated['variant_id'])
            ? Variant::where('item_id', $item->id)->findOrFail($validated['variant_id'])
            : null;

        return response()->json($this->priceResolver->resolve($account, $item, $variant)->toArray());
    }

    /**
     * Resolved wholesale prices for active menu items (base variant null).
     * Used by the admin price list so the owner can see agreed vs guessed prices.
     */
    public function resolvedPrices(int $id): JsonResponse
    {
        $account = TradeAccount::findOrFail($id);

        $items = Item::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->limit(500)
            ->get(['id', 'name', 'sku', 'base_price', 'wholesale_price_laar']);

        $rows = $items->map(function (Item $item) use ($account) {
            $resolved = $this->priceResolver->resolve($account, $item);

            return [
                'item_id' => $item->id,
                'item_name' => $item->name,
                'sku' => $item->sku,
                'variant_id' => null,
                ...$resolved->toArray(),
                'has_account_entry' => $resolved->source === 'account_list',
                'item_wholesale_price_laar' => $item->wholesale_price_laar,
            ];
        });

        return response()->json(['data' => $rows]);
    }

    /** @return array<string, mixed> */
    private function validateAccount(Request $request, bool $updating = false): array
    {
        return $request->validate([
            'customer_id' => [$updating ? 'sometimes' : 'required', 'integer', 'exists:customers,id'],
            'shop_name' => [$updating ? 'sometimes' : 'required', 'string', 'max:255'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:40'],
            'settlement_mode' => ['sometimes', Rule::in(['sale_or_return', 'firm_sale'])],
            'billing_cycle' => ['sometimes', Rule::in(['weekly', 'fortnightly', 'monthly', 'per_delivery'])],
            'payment_terms_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'missing_policy' => ['sometimes', Rule::in(['charge', 'write_off', 'dispute'])],
            'default_discount_bp' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'delivery_days' => ['nullable', 'array'],
            'delivery_days.*' => [Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])],
            'is_active' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }

    /** @return array<string, mixed> */
    private function validatePriceEntry(Request $request): array
    {
        return $request->validate([
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'variant_id' => ['nullable', 'integer', 'exists:variants,id'],
            'price_laar' => ['required', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    /** @return array<string, mixed> */
    private function formatAccount(TradeAccount $account, bool $detailed = false): array
    {
        /** @var Customer|null $customer */
        $customer = $account->customer;

        $payload = [
            'id' => $account->id,
            'customer_id' => $account->customer_id,
            'shop_name' => $account->shop_name,
            'contact_name' => $account->contact_name,
            'contact_phone' => $account->contact_phone,
            'settlement_mode' => $account->settlement_mode,
            'billing_cycle' => $account->billing_cycle,
            'payment_terms_days' => $account->payment_terms_days,
            'resolved_payment_terms_days' => $account->resolvedPaymentTermsDays(),
            'missing_policy' => $account->missing_policy,
            'default_discount_bp' => $account->default_discount_bp,
            'delivery_days' => $account->delivery_days,
            'is_active' => (bool) $account->is_active,
            'notes' => $account->notes,
            'created_at' => $account->created_at?->toIso8601String(),
            'updated_at' => $account->updated_at?->toIso8601String(),
            'customer' => $customer ? [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone,
                'credit_enabled' => (bool) $customer->credit_enabled,
                'credit_status' => $customer->credit_status,
                'credit_limit_laar' => $customer->credit_limit_laar,
                'credit_balance_laar' => $customer->credit_balance_laar,
                'credit_payment_terms_days' => $customer->credit_payment_terms_days,
            ] : null,
        ];

        if ($detailed) {
            $payload['credit_warning'] = $customer && ! $customer->credit_enabled
                ? 'Credit is not enabled for this customer. Dispatching to this shop on account will not be possible until credit is approved.'
                : null;
        }

        return $payload;
    }

    /** @return array<string, mixed> */
    private function formatPriceEntry(TradePriceListEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'trade_account_id' => $entry->trade_account_id,
            'item_id' => $entry->item_id,
            'variant_id' => $entry->variant_id,
            'price_laar' => (int) $entry->price_laar,
            'price_mvr' => number_format(((int) $entry->price_laar) / 100, 2, '.', ''),
            'is_active' => (bool) $entry->is_active,
            'item' => $entry->item ? [
                'id' => $entry->item->id,
                'name' => $entry->item->name,
                'sku' => $entry->item->sku,
                'wholesale_price_laar' => $entry->item->wholesale_price_laar,
            ] : null,
            'variant' => $entry->variant ? [
                'id' => $entry->variant->id,
                'name' => $entry->variant->name,
            ] : null,
            'source' => 'account_list',
            'created_at' => $entry->created_at?->toIso8601String(),
            'updated_at' => $entry->updated_at?->toIso8601String(),
        ];
    }
}
