<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DailySpecial extends Model
{
    protected $fillable = [
        'item_id', 'badge_label', 'special_price', 'discount_pct',
        'start_date', 'end_date', 'start_time', 'end_time',
        'days_of_week', 'max_quantity', 'sold_count', 'is_active', 'description',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'days_of_week' => 'array',
        'is_active' => 'boolean',
        'special_price' => 'decimal:2',
        'discount_pct' => 'integer',
        'sold_count' => 'integer',
        'max_quantity' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function variantOverrides(): HasMany
    {
        return $this->hasMany(DailySpecialVariant::class);
    }

    public function isCurrentlyActive(): bool
    {
        if (!$this->start_date || !$this->end_date || !$this->is_active) {
            return false;
        }

        $now = Carbon::now();
        $time = $now->format('H:i:s');
        $start = self::clock($this->start_time);
        $end = self::clock($this->end_time);

        // The day the current run belongs to. A window that crosses midnight
        // (22:00 to 02:00) belongs, after midnight, to the evening before:
        // a Friday-night special still runs at 01:00 on Saturday, and the
        // last night of the special runs past its end date into the morning
        // (pricing audit, 2026-10-01; same rule as a promotion's happy hour).
        $day = $now->copy();
        if ($start !== null && $end !== null && $start > $end) {
            if ($time < $start && $time > $end) {
                return false;
            }
            if ($time <= $end) {
                $day = $now->copy()->subDay();
            }
        } else {
            if ($start !== null && $time < $start) {
                return false;
            }
            if ($end !== null && $time > $end) {
                return false;
            }
        }

        $date = $day->toDateString();
        if ($date < $this->start_date->toDateString() || $date > $this->end_date->toDateString()) {
            return false;
        }
        if ($this->days_of_week && !in_array($day->dayOfWeek, array_map('intval', $this->days_of_week), true)) {
            return false;
        }
        if ($this->max_quantity && $this->sold_count >= $this->max_quantity) {
            return false;
        }

        return true;
    }

    /**
     * When the special finishes for good: the end time on its last day (the
     * next morning for a window that crosses midnight), or the end of that
     * day when it has no end time. Countdowns read this, so it must not
     * claim the offer runs till midnight when it stops at three.
     */
    public function endsAt(): ?Carbon
    {
        if (!$this->end_date) {
            return null;
        }
        $end = self::clock($this->end_time);
        if ($end === null) {
            return $this->end_date->copy()->endOfDay();
        }

        $at = Carbon::parse($this->end_date->toDateString() . ' ' . $end);
        $start = self::clock($this->start_time);
        if ($start !== null && $start > $end) {
            $at->addDay();
        }

        return $at;
    }

    /** "14:00" and "14:00:00" both as "14:00:00", so string comparison is exact. */
    private static function clock(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $value = (string) $value;

        return strlen($value) === 5 ? $value . ':00' : substr($value, 0, 8);
    }
}
