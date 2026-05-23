<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OfflineSyncRecord extends Model
{
    protected $fillable = [
        'idempotency_key',
        'local_order_id',
        'device_identifier',
        'user_id',
        'shift_id',
        'server_order_id',
        'status',
        'payload_hash',
        'inventory_conflict',
        'last_error',
        'synced_at',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'shift_id' => 'integer',
        'server_order_id' => 'integer',
        'inventory_conflict' => 'boolean',
        'synced_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function serverOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'server_order_id');
    }
}
