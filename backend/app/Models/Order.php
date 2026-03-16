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
        'offline_id',
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
        'tip_amount',
        'estimated_wait_minutes',
        // Delivery fields
        'delivery_address_line1',
        'delivery_address_line2',
        'delivery_island',
        'delivery_contact_name',
        'delivery_contact_phone',
        'delivery_notes',
        'delivery_fee',
        'delivery_fee_laar',
        'delivery_eta_at',
        'delivery_driver_id',
        'driver_assigned_at',
        'picked_up_at',
        'delivered_at',
        'store_id',
    ];

    protected $casts = [
        // FK integer columns — MySQL PDO returns these as strings without explicit casts
        'customer_id'          => 'integer',
        'restaurant_table_id'  => 'integer',
        'delivery_driver_id'   => 'integer',
        // Datetimes
        'held_at'              => 'datetime',
        'paid_at'              => 'datetime',
        'completed_at'         => 'datetime',
        'delivery_eta_at'      => 'datetime',
        'driver_assigned_at'   => 'datetime',
        'picked_up_at'         => 'datetime',
        'delivered_at'         => 'datetime',
        // Scalars
        'tax_inclusive'           => 'boolean',
        'delivery_fee'            => 'decimal:2',
        'delivery_fee_laar'       => 'integer',
        'tip_amount'              => 'decimal:2',
        'estimated_wait_minutes'  => 'integer',
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

    public function deliveryDriver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'delivery_driver_id');
    }
}
