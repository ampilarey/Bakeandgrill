<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Say on the lines what the header already claimed: this order was received.
 *
 * Money reports now measure a purchase by `received_quantity × unit_cost`
 * instead of the header total filtered on status, because the status cannot
 * tell a part delivery from a full one (see PurchaseSpendQuery). Every live
 * write path records the received quantity, so current data is already right.
 *
 * Older rows may not be. A purchase whose status is `received` but whose lines
 * all sit at zero would drop out of COGS entirely under the new measure — real
 * spend disappearing from the books because of a column nobody filled in. For
 * those rows the header is unambiguous: `received` means the whole order came,
 * so the received quantity is the ordered quantity.
 *
 * Deliberately narrow:
 *   - only `received`, never `partial` — a part delivery's real split is not
 *     recoverable from the header, and guessing it would invent a number;
 *   - only orders where *every* line is zero, so a genuine partial-then-
 *     completed receipt is left exactly as its receipts recorded it.
 *
 * Irreversible by design: down() cannot tell a row it wrote from one a real
 * receipt wrote, and zeroing the latter would delete a fact.
 */
return new class extends Migration
{
    public function up(): void
    {
        $candidates = DB::table('purchases')
            ->where('status', 'received')
            ->pluck('id');

        foreach ($candidates->chunk(200) as $chunk) {
            $ids = $chunk->all();

            // Orders where something was recorded as received are already
            // telling the truth; leave them alone.
            $touched = DB::table('purchase_items')
                ->whereIn('purchase_id', $ids)
                ->where('received_quantity', '>', 0)
                ->distinct()
                ->pluck('purchase_id')
                ->all();

            $blank = array_values(array_diff($ids, $touched));
            if ($blank === []) {
                continue;
            }

            DB::table('purchase_items')
                ->whereIn('purchase_id', $blank)
                ->update([
                    'received_quantity' => DB::raw('quantity'),
                    'receive_status' => 'complete',
                ]);
        }
    }

    public function down(): void
    {
        // No reverse: see the class docblock.
    }
};
