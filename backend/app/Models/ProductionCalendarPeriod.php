<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A run of days that are not ordinary trading days, as far as the
 * production plan is concerned. See the migration for the why.
 */
class ProductionCalendarPeriod extends Model
{
    public const KINDS = [
        'public_holiday' => 'Public holiday',
        'school_holiday' => 'School holiday',
        'office_holiday' => 'Office holiday',
        'ramadan' => 'Ramadan',
        'eid' => 'Eid',
        'event' => 'Event / festival',
        'closed' => 'Closed',
        'other' => 'Other',
    ];

    protected $fillable = [
        'kind', 'label', 'starts_on', 'ends_on', 'expected_change_pct', 'notes', 'created_by',
    ];

    protected $casts = [
        'starts_on' => 'date:Y-m-d',
        'ends_on' => 'date:Y-m-d',
        'expected_change_pct' => 'integer',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Periods touching any day in [$from, $to]. */
    public function scopeOverlapping(Builder $query, string $from, string $to): Builder
    {
        return $query->where('starts_on', '<=', $to)->where('ends_on', '>=', $from);
    }

    public function kindLabel(): string
    {
        return self::KINDS[$this->kind] ?? ucfirst(str_replace('_', ' ', (string) $this->kind));
    }
}
