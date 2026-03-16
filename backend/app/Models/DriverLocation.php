<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverLocation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'delivery_driver_id',
        'latitude',
        'longitude',
        'heading',
        'speed',
        'accuracy',
        'recorded_at',
        'created_at',
    ];

    protected $casts = [
        'delivery_driver_id' => 'integer',
        'latitude'           => 'decimal:7',
        'longitude'          => 'decimal:7',
        'heading'            => 'float',
        'speed'              => 'float',
        'accuracy'           => 'float',
        'recorded_at'        => 'datetime',
        'created_at'         => 'datetime',
    ];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(DeliveryDriver::class, 'delivery_driver_id');
    }
}
