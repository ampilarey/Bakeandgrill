<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CateringRequest extends Model
{
    public const STATUSES = [
        'new',
        'contacted',
        'quoted',
        'confirmed',
        'completed',
        'cancelled',
    ];

    public const OCCASIONS = [
        'office_breakfast',
        'event',
        'other',
    ];

    protected $fillable = [
        'company',
        'occasion',
        'contact_name',
        'phone',
        'email',
        'event_date',
        'headcount',
        'notes',
        'interested_items',
        'staff_notes',
        'quoted_amount',
        'pos_order_id',
        'handled_by',
        'contacted_at',
        'quoted_at',
        'confirmed_at',
        'status',
        'source',
    ];

    protected $casts = [
        'event_date' => 'date',
        'headcount' => 'integer',
        'interested_items' => 'array',
        'quoted_amount' => 'decimal:2',
        'contacted_at' => 'datetime',
        'quoted_at' => 'datetime',
        'confirmed_at' => 'datetime',
    ];

    public function posOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'pos_order_id');
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }
}
