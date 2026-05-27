<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailySpecialVariant extends Model
{
    protected $fillable = [
        'daily_special_id',
        'variant_id',
        'discount_pct',
        'special_price',
    ];

    protected $casts = [
        'discount_pct' => 'integer',
        'special_price' => 'decimal:2',
    ];

    public function dailySpecial(): BelongsTo
    {
        return $this->belongsTo(DailySpecial::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }
}
