<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\SupplierRating;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * One supplier, everything we have bought from them.
 *
 * Owner, 2026-09-20: "in suppliers list, when clicked, can u add advanced
 * features to know all the po and items bought from each supplier". The
 * purchase orders, their lines and the price rows were all recorded; the
 * only ways in were the PO search and a one-item-at-a-time price lookup.
 * This reads them per supplier: how much, how often, what, and whether
 * anybody else sells the same thing for less.
 */
class SupplierProfileService
{
    /** Orders that are money: placed with the shop and not cancelled. */
    private const COUNTED = ['ordered', 'partial', 'received'];

    public const MONTHS = 12;

    public function overview(Supplier $supplier): array
    {
        $all = Purchase::query()
            ->where('supplier_id', $supplier->id)
            ->orderBy('purchase_date')
            ->orderBy('id')
            ->get(['id', 'purchase_number', 'status', 'total', 'paid_amount', 'purchase_date', 'expected_delivery_date', 'actual_delivery_date']);

        $statusCounts = ['draft' => 0, 'ordered' => 0, 'partial' => 0, 'received' => 0, 'cancelled' => 0];
        foreach ($all as $p) {
            $statusCounts[$p->status] = ($statusCounts[$p->status] ?? 0) + 1;
        }

        $counted = $all->filter(fn (Purchase $p) => in_array($p->status, self::COUNTED, true))->values();
        $spend = round((float) $counted->sum(fn (Purchase $p) => (float) $p->total), 2);
        $dates = $counted->map(fn (Purchase $p) => $p->purchase_date?->toDateString())->filter()->unique()->sort()->values();

        $gapDays = null;
        if ($dates->count() >= 2) {
            $first = Carbon::parse($dates->first());
            $last = Carbon::parse($dates->last());
            $gapDays = round($first->diffInDays($last) / ($dates->count() - 1), 1);
        }

        $timed = $counted->filter(fn (Purchase $p) => $p->expected_delivery_date && $p->actual_delivery_date);
        $onTime = $timed->filter(fn (Purchase $p) => $p->actual_delivery_date->lte($p->expected_delivery_date))->count();

        $ratings = SupplierRating::query()->where('supplier_id', $supplier->id)->get();
        $avg = fn (string $col) => $ratings->isEmpty() ? null : round((float) $ratings->avg($col), 1);

        $lines = $this->lines($supplier->id);
        $owing = $counted->filter(fn (Purchase $p) => (float) $p->owed > 0.0);

        return [
            'supplier' => $this->supplierCard($supplier),
            // What is still to pay them (owner, 2026-09-21).
            'owed' => [
                'amount' => round((float) $owing->sum(fn (Purchase $p) => (float) $p->owed), 2),
                'orders' => $owing->count(),
                'oldest_date' => $owing->map(fn (Purchase $p) => $p->purchase_date?->toDateString())->filter()->min(),
            ],
            'orders' => [
                'count' => $counted->count(),
                'spend' => $spend,
                'average' => $counted->count() > 0 ? round($spend / $counted->count(), 2) : null,
                'first_date' => $dates->first(),
                'last_date' => $dates->last(),
                'days_between' => $gapDays,
                'on_time' => $timed->count() > 0 ? ['on_time' => $onTime, 'timed' => $timed->count(), 'rate' => round($onTime / $timed->count() * 100)] : null,
                'by_status' => $statusCounts,
                'open' => $statusCounts['ordered'] + $statusCounts['partial'],
            ],
            'items' => [
                'count' => $lines->pluck('inventory_item_id')->unique()->count(),
                'top' => $this->topItems($lines),
            ],
            'monthly' => $this->monthly($counted),
            'ratings' => [
                'count' => $ratings->count(),
                'quality' => $avg('quality_score'),
                'delivery' => $avg('delivery_score'),
                'accuracy' => $avg('accuracy_score'),
                'price' => $avg('price_score'),
                'overall' => $ratings->isEmpty() ? null : round((float) $ratings->avg(fn (SupplierRating $r) => ($r->quality_score + $r->delivery_score + $r->accuracy_score + $r->price_score) / 4), 1),
            ],
        ];
    }

    /**
     * Every item this supplier has sold us: how often, how much, what it
     * cost first and last, and whether somebody else's latest price beats
     * theirs.
     *
     * @return array{supplier: array<string, mixed>, items: list<array<string, mixed>>}
     */
    public function items(Supplier $supplier): array
    {
        $lines = $this->lines($supplier->id);
        if ($lines->isEmpty()) {
            return ['supplier' => $this->supplierCard($supplier), 'items' => []];
        }

        $itemIds = $lines->pluck('inventory_item_id')->unique()->values();
        $items = InventoryItem::query()->whereIn('id', $itemIds)->get(['id', 'name', 'unit', 'photo_path', 'is_active'])->keyBy('id');

        // Other shops' latest price for the same item, within the year.
        $others = SupplierPriceHistory::query()
            ->with('supplier:id,name')
            ->whereIn('inventory_item_id', $itemIds)
            ->where('supplier_id', '!=', $supplier->id)
            ->where('recorded_at', '>=', Carbon::today()->subDays(365)->toDateString())
            ->orderByDesc('recorded_at')
            ->orderByDesc('id')
            ->get(['inventory_item_id', 'supplier_id', 'unit_price', 'recorded_at'])
            ->groupBy('inventory_item_id')
            ->map(function (Collection $rows) {
                // Latest per supplier, then the cheapest of those.
                return $rows->unique('supplier_id')->sortBy(fn (SupplierPriceHistory $r) => (float) $r->unit_price)->first();
            });

        $out = [];
        foreach ($lines->groupBy('inventory_item_id') as $itemId => $rows) {
            $item = $items->get($itemId);
            if ($item === null) {
                continue;
            }
            /** @var Collection<int, PurchaseItem> $rows */
            $sorted = $rows->sortBy([fn ($a, $b) => strcmp((string) $a->purchase->purchase_date?->toDateString(), (string) $b->purchase->purchase_date?->toDateString()) ?: $a->id <=> $b->id])->values();
            $first = $sorted->first();
            $last = $sorted->last();
            $firstPrice = round((float) $first->unit_cost, 4);
            $lastPrice = round((float) $last->unit_cost, 4);
            $other = $others->get($itemId);
            $otherPrice = $other ? round((float) $other->unit_price, 4) : null;

            $out[] = [
                'item_id' => (int) $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'photo_url' => $item->photo_url,
                'is_active' => (bool) $item->is_active,
                'orders' => $rows->pluck('purchase_id')->unique()->count(),
                'quantity' => round((float) $rows->sum(fn (PurchaseItem $l) => (float) $l->quantity), 3),
                'spend' => round((float) $rows->sum(fn (PurchaseItem $l) => (float) $l->total_cost), 2),
                'first' => ['price' => $firstPrice, 'date' => $first->purchase->purchase_date?->toDateString()],
                'last' => [
                    'price' => $lastPrice,
                    'date' => $last->purchase->purchase_date?->toDateString(),
                    'brand' => $last->brand,
                    'purchase_number' => $last->purchase->purchase_number,
                    // For "order it again": the same amount as last time.
                    'quantity' => round((float) $last->quantity, 3),
                ],
                'change_pct' => $sorted->count() > 1 ? PriceChangesService::pct($firstPrice, $lastPrice) : null,
                // What we paid this shop each time, for the chart. From the
                // order lines themselves, so an order placed before prices
                // were being recorded still draws.
                'points' => $sorted->slice(-100)->map(fn (PurchaseItem $l) => [
                    'date' => $l->purchase->purchase_date?->toDateString(),
                    'price' => round((float) $l->unit_cost, 4),
                    'brand' => $l->brand,
                    'purchase_number' => $l->purchase->purchase_number,
                ])->values()->all(),
                'elsewhere' => $other ? [
                    'supplier' => $other->supplier?->name,
                    'price' => $otherPrice,
                    'date' => $other->recorded_at->toDateString(),
                    'cheaper' => $otherPrice !== null && $otherPrice < $lastPrice,
                ] : null,
            ];
        }

        usort($out, fn (array $a, array $b) => $b['spend'] <=> $a['spend'] ?: strcasecmp($a['name'], $b['name']));

        return ['supplier' => $this->supplierCard($supplier), 'items' => $out];
    }

    /**
     * What is owed to whom: every placed, uncancelled order with money still
     * to pay, added up per supplier. A purchase from a typed shop name with
     * no supplier record is listed under that name.
     *
     * @return array{suppliers: list<array<string, mixed>>, total_owed: float, orders: int}
     */
    public function payables(): array
    {
        $open = Purchase::query()
            ->with('supplier:id,name')
            ->whereIn('status', Purchase::OWING_STATUSES)
            ->whereColumn('paid_amount', '<', 'total')
            ->orderBy('purchase_date')
            ->limit(5000)
            ->get(['id', 'purchase_number', 'supplier_id', 'supplier_name_text', 'status', 'total', 'paid_amount', 'purchase_date'])
            ->filter(fn (Purchase $p) => (float) $p->owed > 0.0);

        $rows = $open->groupBy(fn (Purchase $p) => $p->supplier_id ? 's:' . $p->supplier_id : 't:' . mb_strtolower(trim((string) $p->supplier_name_text)))
            ->map(function (Collection $orders) {
                $first = $orders->first();

                return [
                    'supplier_id' => $first->supplier_id,
                    'name' => $first->supplier?->name ?? (trim((string) $first->supplier_name_text) ?: 'Unknown shop'),
                    'owed' => round((float) $orders->sum(fn (Purchase $p) => (float) $p->owed), 2),
                    'orders' => $orders->count(),
                    'oldest_date' => $orders->map(fn (Purchase $p) => $p->purchase_date?->toDateString())->filter()->min(),
                    'oldest_number' => $first->purchase_number,
                ];
            })
            ->sortByDesc('owed')
            ->values()
            ->all();

        return [
            'suppliers' => $rows,
            'total_owed' => round((float) $open->sum(fn (Purchase $p) => (float) $p->owed), 2),
            'orders' => $open->count(),
        ];
    }

    /** @return Collection<int, PurchaseItem> */
    private function lines(int $supplierId): Collection
    {
        return PurchaseItem::query()
            ->with('purchase:id,purchase_number,purchase_date,status')
            ->whereNotNull('inventory_item_id')
            ->whereHas('purchase', fn ($q) => $q->where('supplier_id', $supplierId)->whereIn('status', self::COUNTED))
            ->limit(20000)
            ->get(['id', 'purchase_id', 'inventory_item_id', 'quantity', 'unit_cost', 'total_cost', 'brand']);
    }

    /** @param Collection<int, PurchaseItem> $lines */
    private function topItems(Collection $lines, int $limit = 5): array
    {
        if ($lines->isEmpty()) {
            return [];
        }
        $names = InventoryItem::query()->whereIn('id', $lines->pluck('inventory_item_id')->unique())->pluck('name', 'id');

        return $lines->groupBy('inventory_item_id')
            ->map(fn (Collection $rows, $id) => [
                'item_id' => (int) $id,
                'name' => $names->get($id, '?'),
                'spend' => round((float) $rows->sum(fn (PurchaseItem $l) => (float) $l->total_cost), 2),
                'orders' => $rows->pluck('purchase_id')->unique()->count(),
            ])
            ->sortByDesc('spend')
            ->take($limit)
            ->values()
            ->all();
    }

    /** @param Collection<int, Purchase> $counted */
    private function monthly(Collection $counted): array
    {
        $out = [];
        $cursor = Carbon::today()->startOfMonth()->subMonths(self::MONTHS - 1);
        for ($i = 0; $i < self::MONTHS; $i++) {
            $out[$cursor->format('Y-m')] = ['month' => $cursor->format('Y-m'), 'spend' => 0.0, 'orders' => 0];
            $cursor->addMonth();
        }
        foreach ($counted as $p) {
            $key = $p->purchase_date?->format('Y-m');
            if ($key !== null && isset($out[$key])) {
                $out[$key]['spend'] = round($out[$key]['spend'] + (float) $p->total, 2);
                $out[$key]['orders']++;
            }
        }

        return array_values($out);
    }

    private function supplierCard(Supplier $s): array
    {
        return [
            'id' => (int) $s->id,
            'name' => $s->name,
            'contact_name' => $s->contact_name,
            'phone' => $s->phone,
            'extra_phones' => $s->extra_phones ?? [],
            'email' => $s->email,
            'address' => $s->address,
            'tin' => $s->tin,
            'payment_terms' => $s->payment_terms,
            'lead_days' => $s->lead_days,
            'bank_name' => $s->bank_name,
            'bank_account_name' => $s->bank_account_name,
            'bank_account_number' => $s->bank_account_number,
            'notes' => $s->notes,
            'is_active' => (bool) $s->is_active,
        ];
    }
}
