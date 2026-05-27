<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class OrderItem extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'order_id',
        'item_id',
        'variant_id',
        'item_name',
        'variant_name',
        'quantity',
        'unit_price',
        'original_unit_price',
        'daily_special_id',
        'total_price',
        'tax_rate',
        'notes',
        'status',
    ];

    protected $casts = [
        'order_id' => 'integer',
        'item_id' => 'integer',
        'variant_id' => 'integer',
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'original_unit_price' => 'decimal:2',
        'daily_special_id' => 'integer',
        'total_price' => 'decimal:2',
        'tax_rate' => 'decimal:2',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class);
    }

    public function dailySpecial(): BelongsTo
    {
        return $this->belongsTo(DailySpecial::class);
    }

    public function modifiers(): HasMany
    {
        return $this->hasMany(OrderItemModifier::class);
    }
}
