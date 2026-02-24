<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use SoftDeletes;
    protected $fillable = [
        'order_number',
        'type',
        'status',
        'restaurant_table_id',
        'customer_id',
        'user_id',
        'device_id',
        'subtotal',
        'tax_amount',
        'discount_amount',
        'total',
        'subtotal_laar',
        'tax_laar',
        'promo_discount_laar',
        'loyalty_discount_laar',
        'manual_discount_laar',
        'total_laar',
        'tax_inclusive',
        'tax_rate_bp',
        'notes',
        'customer_notes',
        'held_at',
        'paid_at',
        'completed_at',
    ];

    protected $casts = [
        'held_at' => 'datetime',
        'paid_at' => 'datetime',
        'completed_at' => 'datetime',
        'tax_inclusive' => 'boolean',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'restaurant_table_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function receipt(): HasOne
    {
        return $this->hasOne(Receipt::class);
    }
}
