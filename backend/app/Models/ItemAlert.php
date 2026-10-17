<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A customer waiting for a dish to come back or go on sale (App\Domains\Menu\Services\ItemAlerts). */
class ItemAlert extends Model
{
    public const BACK = 'back';

    public const LAUNCH = 'launch';

    protected $fillable = ['item_id', 'customer_id', 'kind', 'sent_at'];

    protected $casts = ['sent_at' => 'datetime'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
