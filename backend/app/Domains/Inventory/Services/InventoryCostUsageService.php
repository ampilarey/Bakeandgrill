<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\InventoryItem;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\SupplierPriceHistory;
use Illuminate\Support\Facades\DB;

/**
 * What one thing costs, and how much of it you got through.
 *
 * Owner, 2026-09-06: "same item has different brands and different sizes.
 * Sometime we buy different brands and different sizes. I need to know the
 * best price and total quantity of the product utilized even though different
 * brands and sizes."
 *
 * Every piece of this was already being recorded — the brand on the purchase
 * line, the pack it came in, the price divided down to the base unit, and
 * every movement in and out. Nothing added the numbers up, so the one question
 * worth asking about a shopping habit had no answer on any screen.
 *
 * The whole trick is that **everything reduces to the base unit**. Ghee counted
 * in ml, bought as a 100 ml tin of one brand and a 500 ml tin of another, is
 * comparable the moment both are expressed as MVR per ml — and that comparison
 * is frequently a surprise, because the bigger tin is not reliably the cheaper
 * one. Nothing here ever compares two pack prices directly; a tin against a tin
 * is not a comparison, it is a coincidence of size.
 */
final class InventoryCostUsageService
{
    /**
     * Price per base unit, by brand and pack and supplier, cheapest first.
     *
     * Two sources, because two paths buy things. `purchase_items` is the
     * fuller one — it knows the pack — and covers purchase orders.
     * `supplier_price_history` rows with no `purchase_id` are the buying list,
     * where somebody bought it on a shop run; those have a price and a brand
     * but no pack, and are marked as such rather than guessed at.
     *
     * @return list<array<string, mixed>>
     */
    public function priceComparison(InventoryItem $item, int $days = 90): array
    {
        $since = $days > 0 ? now()->subDays($days)->toDateString() : null;

        $rows = $this->fromPurchaseLines($item, $since);
        foreach ($this->fromBuyingList($item, $since) as $row) {
            $rows[] = $row;
        }

        // Cheapest per base unit first — the only ordering that answers the
        // question. A row with no usable price sinks to the bottom rather than
        // topping the list at zero.
        usort($rows, function (array $a, array $b): int {
            if ($a['per_unit'] <= 0) {
                return $b['per_unit'] <= 0 ? 0 : 1;
            }
            if ($b['per_unit'] <= 0) {
                return -1;
            }

            return $a['per_unit'] <=> $b['per_unit'];
        });

        foreach ($rows as $i => $row) {
            $rows[$i]['is_cheapest'] = $i === 0 && $row['per_unit'] > 0;
        }

        return $rows;
    }

    /**
     * How much went in, how much went out, and what it cost, over the window.
     *
     * Read off `stock_movements` rather than off purchases, so a delivery that
     * never became a purchase order still counts and so waste is separable
     * from what the kitchen actually used.
     *
     * @return array<string, mixed>
     */
    public function usage(InventoryItem $item, int $days = 90): array
    {
        $query = StockMovement::query()->where('inventory_item_id', $item->id);
        if ($days > 0) {
            $query->where(function ($q) use ($days) {
                $cutoff = now()->subDays($days);
                $q->where('occurred_at', '>=', $cutoff)
                    ->orWhere(fn ($inner) => $inner->whereNull('occurred_at')->where('created_at', '>=', $cutoff));
            });
        }

        $rows = (clone $query)
            ->select('type', DB::raw('SUM(quantity) as qty'), DB::raw('COUNT(*) as n'))
            ->groupBy('type')
            ->get();

        $sum = fn (callable $keep) => (float) $rows->filter(fn ($r) => $keep((string) $r->type))->sum('qty');

        // A sale is the kitchen using it through a recipe; a refund puts some
        // back. Netting them is what "used" means to somebody counting stock.
        $used = -($sum(fn (string $t) => $t === 'sale') + $sum(fn (string $t) => $t === 'refund'));
        $receivedIn = $sum(fn (string $t) => $t === 'purchase');

        /*
         * An adjustment is either direction: a stock count correction, or
         * something thrown away. Split by sign rather than lumped, because
         * "we wasted 400 ml" and "the count was 400 ml out" are different
         * facts and only one of them is a cost worth chasing.
         */
        $adjustments = (clone $query)
            ->whereIn('type', ['adjustment', 'adjust', 'waste'])
            ->select(
                DB::raw('SUM(CASE WHEN quantity < 0 THEN quantity ELSE 0 END) as down'),
                DB::raw('SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as up'),
            )
            ->first();

        $spend = $this->spend($item, $days);

        return [
            'window_days' => $days,
            'unit' => (string) $item->unit,
            'received' => round($receivedIn, 3),
            'used' => round($used, 3),
            'written_off' => round(-(float) ($adjustments->down ?? 0), 3),
            'added_back' => round((float) ($adjustments->up ?? 0), 3),
            'on_hand' => round((float) ($item->current_stock ?? 0), 3),
            'spend' => round($spend['total'], 2),
            // What a base unit averaged over the window, which is the number to
            // hold a quoted price up against.
            'average_price' => $spend['quantity'] > 0
                ? round($spend['total'] / $spend['quantity'], 6)
                : null,
            'value_used' => $spend['quantity'] > 0 && $used > 0
                ? round($used * ($spend['total'] / $spend['quantity']), 2)
                : null,
        ];
    }

    /** @return array{total: float, quantity: float} */
    private function spend(InventoryItem $item, int $days): array
    {
        $query = PurchaseItem::query()
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            // A join carries no global scope, so the soft delete has to be
            // said out loud: a deleted order's money is gone from every screen.
            ->whereNull('purchases.deleted_at')
            ->where('purchase_items.inventory_item_id', $item->id);

        if ($days > 0) {
            $query->where('purchases.purchase_date', '>=', now()->subDays($days)->toDateString());
        }

        /*
         * Received only — the same definition as every money report (see
         * PurchaseSpendQuery). The old COALESCE fell back to the *ordered*
         * quantity on legacy rows, so this panel could disagree with the
         * spend hub about the same item.
         */
        $row = $query->select(
            DB::raw('SUM(COALESCE(purchase_items.received_quantity, 0)) as qty'),
            DB::raw('SUM(purchase_items.unit_cost * COALESCE(purchase_items.received_quantity, 0)) as spend'),
        )->first();

        return [
            'total' => (float) ($row->spend ?? 0),
            'quantity' => (float) ($row->qty ?? 0),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function fromPurchaseLines(InventoryItem $item, ?string $since): array
    {
        $query = PurchaseItem::query()
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->leftJoin('suppliers', 'suppliers.id', '=', 'purchases.supplier_id')
            ->whereNull('purchases.deleted_at')
            ->where('purchase_items.inventory_item_id', $item->id)
            ->where('purchase_items.unit_cost', '>', 0);

        if ($since !== null) {
            $query->where('purchases.purchase_date', '>=', $since);
        }

        $rows = $query
            ->select(
                'purchase_items.brand',
                'purchase_items.pack_name',
                'purchase_items.pack_size',
                DB::raw('COALESCE(suppliers.name, purchases.supplier_name_text) as supplier_name'),
                // The best price achieved for this brand-and-pack, not the
                // average: the question is "what can this be had for", and an
                // average of a good day and a bad one answers neither.
                DB::raw('MIN(purchase_items.unit_cost) as best_unit_cost'),
                DB::raw('MAX(purchases.purchase_date) as last_bought'),
                DB::raw('COUNT(*) as times'),
                DB::raw('SUM(COALESCE(purchase_items.received_quantity, purchase_items.quantity)) as total_qty'),
            )
            ->groupBy('purchase_items.brand', 'purchase_items.pack_name', 'purchase_items.pack_size', 'supplier_name')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $perUnit = (float) $row->best_unit_cost;
            $packSize = $row->pack_size !== null ? (float) $row->pack_size : null;

            $out[] = [
                'brand' => $row->brand ?: null,
                'pack_name' => $row->pack_name ?: null,
                'pack_size' => $packSize,
                'supplier' => $row->supplier_name ?: null,
                'per_unit' => round($perUnit, 6),
                // What one of those packs cost, so the row is recognisable as
                // the thing somebody actually carried in.
                'pack_price' => $packSize !== null && $packSize > 0
                    ? round($perUnit * $packSize, 2)
                    : null,
                'times' => (int) $row->times,
                'total_qty' => round((float) $row->total_qty, 3),
                'last_bought' => $row->last_bought,
                'source' => 'purchase',
            ];
        }

        return $out;
    }

    /**
     * Prices from the buying list — a shop run, not a purchase order.
     *
     * These know the brand and the price but never the pack, because nobody
     * asked what container it came in. Left as null rather than assumed:
     * inventing a pack here would put a made-up number beside a real one.
     *
     * @return list<array<string, mixed>>
     */
    private function fromBuyingList(InventoryItem $item, ?string $since): array
    {
        $query = SupplierPriceHistory::query()
            ->leftJoin('suppliers', 'suppliers.id', '=', 'supplier_price_history.supplier_id')
            ->where('supplier_price_history.inventory_item_id', $item->id)
            // A row with a purchase_id is already counted above, in fuller
            // detail. Only the shop-run prices are new information here.
            ->whereNull('supplier_price_history.purchase_id')
            ->where('supplier_price_history.unit_price', '>', 0);

        if ($since !== null) {
            $query->where('supplier_price_history.recorded_at', '>=', $since);
        }

        $rows = $query
            ->select(
                'supplier_price_history.brand',
                DB::raw('suppliers.name as supplier_name'),
                DB::raw('MIN(supplier_price_history.unit_price) as best_unit_cost'),
                DB::raw('MAX(supplier_price_history.recorded_at) as last_bought'),
                DB::raw('COUNT(*) as times'),
            )
            ->groupBy('supplier_price_history.brand', 'supplier_name')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'brand' => $row->brand ?: null,
                'pack_name' => null,
                'pack_size' => null,
                'supplier' => $row->supplier_name ?: null,
                'per_unit' => round((float) $row->best_unit_cost, 6),
                'pack_price' => null,
                'times' => (int) $row->times,
                'total_qty' => null,
                'last_bought' => $row->last_bought,
                'source' => 'buying_list',
            ];
        }

        return $out;
    }
}
