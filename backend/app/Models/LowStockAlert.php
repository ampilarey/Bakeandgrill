<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LowStockAlert extends Model
{
    protected $fillable = [
        'item_id',
        'stock_level',
        'threshold',
        'alert_type',
        'recipients',
        'sent',
        'sent_at',
        'message',
    ];

    protected $casts = [
        'item_id'     => 'integer',
        'stock_level' => 'integer',
        'threshold'   => 'integer',
        'recipients'  => 'array',
        'sent'        => 'boolean',
        'sent_at'     => 'datetime',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    /**
     * Scope: unsent alerts only.
     */
    public function scopeUnsent($query)
    {
        return $query->where('sent', false);
    }

    /**
     * Mark the alert as sent.
     */
    public function markSent(): void
    {
        $this->update(['sent' => true, 'sent_at' => now()]);
    }
}
