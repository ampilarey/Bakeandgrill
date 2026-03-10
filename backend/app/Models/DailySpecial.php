<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailySpecial extends Model
{
    protected $fillable = [
        'item_id', 'badge_label', 'special_price', 'discount_pct',
        'start_date', 'end_date', 'start_time', 'end_time',
        'days_of_week', 'max_quantity', 'sold_count', 'is_active', 'description',
    ];

    protected $casts = [
        'start_date'   => 'date',
        'end_date'     => 'date',
        'days_of_week' => 'array',
        'is_active'    => 'boolean',
        'special_price'=> 'decimal:2',
        'discount_pct' => 'integer',
        'sold_count'   => 'integer',
        'max_quantity' => 'integer',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function isCurrentlyActive(): bool
    {
        $now  = Carbon::now();
        $date = $now->toDateString();
        $time = $now->format('H:i:s');

        if (!$this->is_active) return false;
        if ($date < $this->start_date->toDateString() || $date > $this->end_date->toDateString()) return false;
        if ($this->days_of_week && !in_array($now->dayOfWeek, $this->days_of_week, true)) return false;
        if ($this->start_time && $time < $this->start_time) return false;
        if ($this->end_time   && $time > $this->end_time)   return false;
        if ($this->max_quantity && $this->sold_count >= $this->max_quantity) return false;

        return true;
    }

    public function getEffectivePriceFor(float $basePrice): float
    {
        if ($this->special_price) return (float) $this->special_price;
        if ($this->discount_pct) return round($basePrice * (1 - $this->discount_pct / 100), 2);

        return $basePrice;
    }
}
