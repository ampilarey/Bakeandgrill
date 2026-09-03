<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Items switched to "no sizes" in the editor kept their old sizes live: the
 * form sent no variants list, so nothing pruned them. They stayed out of the
 * editor (which hides retired rows) but in the quick-edit sheet and, for the
 * POS and the apps, still sellable (owner, 2026-09-03: Black Tea).
 *
 * Same rule as VariantSyncService::destroy(): a size that has ever been
 * ordered is deactivated so receipts and reports still resolve it; one that
 * never sold is deleted. Only sizeless items (has_variants = false) are
 * touched.
 */
return new class extends Migration
{
    public function up(): void
    {
        $orphans = DB::table('variants')
            ->join('items', 'items.id', '=', 'variants.item_id')
            ->where('items.has_variants', false)
            ->select('variants.id')
            ->pluck('variants.id');

        if ($orphans->isEmpty()) {
            return;
        }

        $ordered = DB::table('order_items')
            ->whereIn('variant_id', $orphans)
            ->distinct()
            ->pluck('variant_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $toRetire = $orphans->filter(fn ($id) => in_array((int) $id, $ordered, true))->values();
        $toDelete = $orphans->reject(fn ($id) => in_array((int) $id, $ordered, true))->values();

        if ($toRetire->isNotEmpty()) {
            DB::table('variants')->whereIn('id', $toRetire)->update(['is_active' => false, 'updated_at' => now()]);
        }
        if ($toDelete->isNotEmpty()) {
            DB::table('variants')->whereIn('id', $toDelete)->delete();
        }

        echo sprintf(
            "Sizeless items: retired %d ordered size(s), deleted %d never-sold size(s).\n",
            $toRetire->count(),
            $toDelete->count(),
        );
    }

    public function down(): void
    {
        // Deleted rows cannot be restored; retired ones stay retired.
    }
};
