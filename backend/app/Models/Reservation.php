<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    protected $fillable = [
        'customer_id',
        'customer_name',
        'customer_phone',
        'party_size',
        'date',
        'time_slot',
        'duration_minutes',
        'table_id',
        'status',
        'notes',
        'tracking_token',
    ];

    protected $casts = [
        'date'       => 'date',
        'party_size' => 'integer',
        'duration_minutes' => 'integer',
        'table_id'   => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function isPending(): bool    { return $this->status === 'pending'; }
    public function isConfirmed(): bool  { return $this->status === 'confirmed'; }
    public function isCancelled(): bool  { return $this->status === 'cancelled'; }
}
