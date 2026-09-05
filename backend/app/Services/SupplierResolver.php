<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Supplier;
use Illuminate\Support\Facades\DB;

/**
 * One seller, whatever you call it.
 *
 * Purchasing used to carry two ideas of who sold you something: `supplier_id`,
 * a record you picked from a list, and `supplier_name_text`, a name you typed
 * when the seller was just the shop on the corner. Every comparison the system
 * makes — cheapest source, price hints on the buying screen, the restock plan's
 * price column, spend by supplier, ratings — joins the supplier table. A typed
 * name has no row to join, so all of that was blind to it, and worse, a price
 * paid at a typed shop was never written to price history at all. Buy flour at
 * the same corner shop fifty times and the system still could not say what you
 * usually pay there.
 *
 * So there is one idea now. You still type the name; the name becomes a
 * supplier. A shop you visit once is a supplier with one purchase against it,
 * which is exactly the record that makes its price comparable to everyone
 * else's. Nobody fills in a form to make that happen.
 */
class SupplierResolver
{
    /**
     * The supplier for a typed name, creating one the first time it is seen.
     *
     * Matching is case-insensitive on the trimmed name, so "Fahi Store",
     * "fahi store" and " Fahi Store " are one supplier rather than three.
     * Soft-deleted suppliers are reused rather than duplicated: a name you
     * retired and then bought from again is the same shop, so it comes back
     * instead of becoming a second row the reports would treat separately.
     */
    public function forName(string $name): ?Supplier
    {
        $name = trim($name);
        if ($name === '') {
            return null;
        }

        // Two people entering the same shop on two tills would otherwise race
        // between the lookup and the insert and create it twice.
        return DB::transaction(function () use ($name) {
            $existing = Supplier::withTrashed()
                ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                if ($existing->trashed()) {
                    $existing->restore();
                }

                return $existing;
            }

            // Nothing but the name. Contact details, terms and lead days are
            // for suppliers somebody actually sets up; a corner shop has none
            // and should not be a half-empty form demanding them.
            return Supplier::create([
                'name' => $name,
                'is_active' => true,
            ]);
        });
    }

    /**
     * Resolve whichever of the two the caller sent into one supplier.
     *
     * An explicit id wins: picking "Fahi Store" from the list and typing
     * something else in the same breath is not a second seller, it is a stale
     * field. Returns null only when neither was given, which the callers treat
     * as a validation failure.
     */
    public function resolve(?int $supplierId, ?string $typedName): ?Supplier
    {
        if ($supplierId !== null && $supplierId > 0) {
            $supplier = Supplier::find($supplierId);
            if ($supplier !== null) {
                return $supplier;
            }
        }

        return $typedName === null ? null : $this->forName($typedName);
    }
}
