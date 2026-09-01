<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * variants.barcode was the only scan code without a unique index.
 *
 * items.sku, items.barcode and variants.sku all have one; this column was
 * missed when the table was created, so two sizes could be given the same
 * barcode and the scan endpoint would resolve it to whichever row the query
 * reached first — silently ringing up the wrong size at the wrong price.
 *
 * Duplicates already in the data cannot survive the index, and there is no
 * honest way to guess which row was meant to keep the code. The oldest row
 * keeps it and the rest are cleared, each one printed by name so it can be
 * relabelled. A cleared barcode costs a reprint; a duplicated one charges a
 * customer for the wrong size, so this is the safer direction.
 *
 * Written with the query builder rather than raw SQL because CI runs the suite
 * against PostgreSQL as well as MySQL, and the default test database is SQLite.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('variants') || !Schema::hasColumn('variants', 'barcode')) {
            return;
        }

        $this->clearDuplicateBarcodes();

        // Re-running against a database that already has the index (a TEST box
        // restored from a later dump, say) must not abort the whole migration.
        try {
            Schema::table('variants', function (Blueprint $table) {
                $table->unique('barcode', 'variants_barcode_unique');
            });
        } catch (\Throwable $e) {
            echo "  variants.barcode unique index not added: {$e->getMessage()}\n";
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('variants')) {
            return;
        }

        try {
            Schema::table('variants', function (Blueprint $table) {
                $table->dropUnique('variants_barcode_unique');
            });
        } catch (\Throwable) {
            // Never existed; nothing to undo.
        }
    }

    private function clearDuplicateBarcodes(): void
    {
        $codes = DB::table('variants')
            ->select('barcode')
            ->whereNotNull('barcode')
            ->where('barcode', '!=', '')
            ->groupBy('barcode')
            // An alias in HAVING is rejected by PostgreSQL — count the column.
            ->havingRaw('COUNT(*) > 1')
            ->pluck('barcode');

        foreach ($codes as $code) {
            $rows = DB::table('variants')
                ->where('barcode', $code)
                ->orderBy('id')
                ->pluck('name', 'id');

            $keep = (int) array_key_first($rows->all());

            foreach ($rows as $id => $name) {
                if ((int) $id === $keep) {
                    continue;
                }

                DB::table('variants')->where('id', $id)->update(['barcode' => null]);
                echo "  cleared duplicate barcode {$code} from size \"{$name}\" (variant {$id})\n";
            }
        }
    }
};
