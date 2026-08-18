<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Daily tally of how a recommended item performed on one surface.
 *
 * @see \App\Domains\Marketing\Services\SuggestionTracker
 */
class ItemSuggestionStat extends Model
{
    protected $fillable = [
        'stat_date',
        'surface',
        'item_id',
        'shown_count',
        'accepted_count',
        'accepted_revenue',
    ];

    protected $casts = [
        // Deliberately NOT cast to 'date'. The cast writes through Carbon and
        // the grammar's datetime format, so the row lands as "2026-08-18
        // 00:00:00" while every lookup asks for "2026-08-18". MySQL coerces
        // that back to a DATE and hides the mismatch; SQLite does not, so the
        // daily row is found on write and missed on increment. Kept as the
        // plain Y-m-d string it is declared as, which matches everywhere.
        'item_id' => 'integer',
        'shown_count' => 'integer',
        'accepted_count' => 'integer',
        'accepted_revenue' => 'decimal:2',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }
}
