<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Every shop anybody typed becomes a supplier.
 *
 * Purchasing carried two ideas of who sold you something and only one of them
 * was visible to the reports. This walks the three tables that hold a typed
 * name, finds or creates the supplier for each distinct name, and links it. It
 * also fills in price history for the purchases that gain a supplier here,
 * since those prices were never recorded against anyone and are the whole
 * reason the link is worth making.
 *
 * Written against the query builder rather than dialect SQL: this project runs
 * MySQL locally, PostgreSQL in the compatibility suite and SQLite in tests.
 */
return new class extends Migration
{
    /** The tables that carry a typed seller name. */
    private const TABLES = [
        'purchases',
        'purchase_request_items',
        'purchase_request_item_quotes',
    ];

    public function up(): void
    {
        $suppliersByKey = $this->existingSuppliers();

        foreach (self::TABLES as $table) {
            if (!DB::getSchemaBuilder()->hasTable($table)) {
                continue;
            }

            $rows = DB::table($table)
                ->select('id', 'supplier_name_text')
                ->whereNull('supplier_id')
                ->whereNotNull('supplier_name_text')
                ->get();

            foreach ($rows as $row) {
                $name = trim((string) $row->supplier_name_text);
                if ($name === '') {
                    continue;
                }

                $key = mb_strtolower($name);
                if (!isset($suppliersByKey[$key])) {
                    $suppliersByKey[$key] = (object) [
                        'id' => DB::table('suppliers')->insertGetId([
                            'name' => $name,
                            'is_active' => true,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]),
                        'name' => $name,
                    ];
                }

                $supplier = $suppliersByKey[$key];

                DB::table($table)->where('id', $row->id)->update([
                    'supplier_id' => $supplier->id,
                    // Keep the denormalised copy, but make it the supplier's
                    // spelling so the two can never disagree from here on.
                    'supplier_name_text' => $supplier->name,
                ]);

                if ($table === 'purchases') {
                    $this->backfillPriceHistory((int) $row->id, (int) $supplier->id);
                }
            }
        }
    }

    /**
     * Suppliers already on file, keyed by lowercased name.
     *
     * Soft-deleted ones count: a name somebody retired and then bought from
     * again is the same shop, and a second row would split its price history.
     *
     * @return array<string, object>
     */
    private function existingSuppliers(): array
    {
        $byKey = [];
        foreach (DB::table('suppliers')->select('id', 'name')->orderBy('id')->get() as $supplier) {
            $key = mb_strtolower(trim((string) $supplier->name));
            // First id wins, so an accidental duplicate name does not reshuffle
            // which supplier the older rows point at.
            $byKey[$key] ??= $supplier;
        }

        return $byKey;
    }

    /**
     * Record what this purchase paid, now that it has somebody to pay.
     *
     * Only stock lines with a real cost, and only when the purchase has no
     * price history at all, so re-running this cannot double up a price point
     * and skew an average built on it.
     */
    private function backfillPriceHistory(int $purchaseId, int $supplierId): void
    {
        if (!DB::getSchemaBuilder()->hasTable('supplier_price_history')) {
            return;
        }

        $already = DB::table('supplier_price_history')->where('purchase_id', $purchaseId)->exists();
        if ($already) {
            return;
        }

        $purchase = DB::table('purchases')->select('purchase_date')->find($purchaseId);
        $recordedAt = $purchase?->purchase_date
            ? substr((string) $purchase->purchase_date, 0, 10)
            : now()->toDateString();

        $lines = DB::table('purchase_items')
            ->join('inventory_items', 'inventory_items.id', '=', 'purchase_items.inventory_item_id')
            ->where('purchase_items.purchase_id', $purchaseId)
            ->where('purchase_items.unit_cost', '>', 0)
            ->select('purchase_items.inventory_item_id', 'purchase_items.unit_cost', 'inventory_items.unit')
            ->get();

        foreach ($lines as $line) {
            DB::table('supplier_price_history')->insert([
                'supplier_id' => $supplierId,
                'inventory_item_id' => $line->inventory_item_id,
                'purchase_id' => $purchaseId,
                'unit_price' => $line->unit_cost,
                'unit' => $line->unit,
                'recorded_at' => $recordedAt,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Irreversible by design.
     *
     * The typed names are still in `supplier_name_text`, so nothing is lost,
     * but there is no way to tell a supplier this migration created from one
     * somebody set up by hand afterwards. Unlinking on that guess would be
     * worse than leaving the links in place.
     */
    public function down(): void
    {
        // Intentionally empty.
    }
};
