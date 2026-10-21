<?php

declare(strict_types=1);

namespace App\Domains\Orders\Support;

use App\Models\RestaurantTable;
use Illuminate\Support\Facades\DB;

/**
 * Number stands for self-seating dine-in (owner, 2026-10-22: "here people
 * sit on their own. How about assigning a virtual table?" and "automatically
 * assigned a random number").
 *
 * A stand is a table row of kind "stand", named "No. 1" to "No. N", made by
 * ensureCount() from Admin → Tables. A dine-in ticket rung at the till with
 * no table of its own gets the lowest free number (assign()), the cashier
 * hands over the matching stand, and the kitchen slip, the kitchen screen
 * and the receipt carry it. Two tills asking in the same second cannot get
 * the same number: the pick runs under a lock, and a number that was taken
 * meanwhile gives way to the next free one. A number is held while its
 * order is open and, unlike a real table, through payment until the order
 * is served (RestaurantTable::seatOwningOrdersQuery), so counter-paid
 * orders keep their number while the food is made.
 */
final class NumberStands
{
    public const NAME_PREFIX = 'No. ';

    public const MAX = 99;

    /** Make or retire stands so exactly $count are active, "No. 1" upward. */
    public static function ensureCount(int $count): void
    {
        $count = max(0, min(self::MAX, $count));
        DB::transaction(function () use ($count): void {
            for ($n = 1; $n <= $count; $n++) {
                $name = self::NAME_PREFIX . $n;
                $stand = RestaurantTable::query()->where('kind', RestaurantTable::KIND_STAND)->where('name', $name)->first();
                if ($stand === null) {
                    RestaurantTable::create([
                        'name' => $name,
                        'kind' => RestaurantTable::KIND_STAND,
                        'capacity' => 1,
                        'status' => 'available',
                        'location' => 'Numbers',
                        'is_active' => true,
                    ]);
                } elseif (!$stand->is_active) {
                    $stand->update(['is_active' => true]);
                }
            }
            // Numbers above the count go: a stand still in use keeps its
            // ticket (the slip has been printed) and is only hidden from the
            // pick, which never offers an inactive stand.
            RestaurantTable::query()
                ->where('kind', RestaurantTable::KIND_STAND)
                ->where('is_active', true)
                ->get()
                ->filter(fn (RestaurantTable $t) => self::numberOf($t) > $count)
                ->each(fn (RestaurantTable $t) => $t->update(['is_active' => false]));
        });
    }

    public static function activeCount(): int
    {
        return RestaurantTable::query()->where('kind', RestaurantTable::KIND_STAND)->where('is_active', true)->count();
    }

    public static function isStand(?int $tableId): bool
    {
        if ($tableId === null) {
            return false;
        }

        return RestaurantTable::query()->whereKey($tableId)->value('kind') === RestaurantTable::KIND_STAND;
    }

    /**
     * The table a till dine-in ticket goes on. A real table chosen by the
     * cashier stays as chosen (an in-use one is refused by the caller as
     * before). No table, or a number that was taken meanwhile, becomes the
     * lowest free number; with no stand free the ticket goes without one.
     *
     * @param int|null $exceptOrderId the ticket's own order, whose number counts as free
     */
    public static function assign(?int $tableId, ?int $exceptOrderId = null): ?int
    {
        if ($tableId !== null && !self::isStand($tableId)) {
            return $tableId;
        }
        if ($tableId !== null && self::isFree($tableId, $exceptOrderId)) {
            return $tableId;
        }

        return self::pick($exceptOrderId);
    }

    /** The lowest free active number, under a lock so two tills never share one. */
    public static function pick(?int $exceptOrderId = null): ?int
    {
        return DB::transaction(function () use ($exceptOrderId): ?int {
            $stands = RestaurantTable::query()
                ->where('kind', RestaurantTable::KIND_STAND)
                ->where('is_active', true)
                ->lockForUpdate()
                ->get()
                ->sortBy(fn (RestaurantTable $t) => self::numberOf($t))
                ->values();
            foreach ($stands as $stand) {
                if (self::isFree((int) $stand->id, $exceptOrderId)) {
                    return (int) $stand->id;
                }
            }

            return null;
        });
    }

    public static function isFree(int $tableId, ?int $exceptOrderId = null): bool
    {
        $table = RestaurantTable::query()->find($tableId);
        if ($table === null || !$table->is_active || in_array($table->status, ['reserved', 'closed'], true)) {
            return false;
        }
        $query = RestaurantTable::seatOwningOrdersQuery($tableId);
        if ($exceptOrderId !== null) {
            $query->where('id', '!=', $exceptOrderId);
        }

        return !$query->exists();
    }

    public static function numberOf(RestaurantTable $stand): int
    {
        return (int) preg_replace('/\D+/', '', (string) $stand->name);
    }
}
