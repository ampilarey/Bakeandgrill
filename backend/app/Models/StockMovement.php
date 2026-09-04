<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    protected $fillable = [
        'idempotency_key',
        'inventory_item_id',
        'user_id',
        'type',
        'quantity',
        'balance_after',
        'unit_cost',
        'reference_type',
        'reference_id',
        'notes',
        'occurred_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
    ];

    /**
     * When the movement happened, for a report that asks by date.
     *
     * `occurred_at` is the real-world moment — a backdated delivery carries the
     * day it arrived. `created_at` is when we wrote it down. They agree for
     * everything entered as it happens; they differ when somebody catches up on
     * paperwork. Rows written before the column existed hold null, so the
     * fallback is what makes old history keep reporting correctly.
     */
    public const OCCURRED_AT_SQL = 'COALESCE(stock_movements.occurred_at, stock_movements.created_at)';

    /** Movements that happened within the window, whenever they were entered. */
    public function scopeOccurredBetween(Builder $query, mixed $from, mixed $to): Builder
    {
        return $query->whereRaw(self::OCCURRED_AT_SQL . ' BETWEEN ? AND ?', [$from, $to]);
    }

    /**
     * Turn the date a purchase carries into the moment to stamp on its movement.
     *
     * Same day: keep the real clock time, so today's movements stay in the
     * order they happened. A past day: midday, because a date-only field says
     * nothing about the hour and midday sits safely inside any report window —
     * ranges here run start-of-day to end-of-day, and midnight on the boundary
     * is the kind of thing that drops a row from one end of a report.
     * A date carrying its own time (a purchase request knows when it was
     * bought) is trusted as given.
     */
    public static function occurredAtFor(mixed $date): CarbonInterface
    {
        if ($date === null) {
            return now();
        }

        $when = $date instanceof CarbonInterface ? $date->copy() : Carbon::parse((string) $date);

        if ($when->isSameDay(now())) {
            return now();
        }

        return $when->format('H:i:s') === '00:00:00' ? $when->setTime(12, 0) : $when;
    }

    public function inventoryItem(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
