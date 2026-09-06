<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlatterGroupItem extends Model
{
    protected $fillable = [
        'platter_group_id',
        'item_id',
        'variant_id',
        'surcharge',
        'sort_order',
    ];

    protected $casts = [
        'platter_group_id' => 'integer',
        'item_id' => 'integer',
        'variant_id' => 'integer',
        'surcharge' => 'decimal:2',
        'sort_order' => 'integer',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(PlatterGroup::class, 'platter_group_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    /** Which size of the child is on offer, when the child is sold in sizes. */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class, 'variant_id');
    }
}
