<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComboItem extends Model
{
    protected $fillable = ['combo_id', 'item_id', 'variant_id', 'quantity', 'is_optional', 'surcharge'];

    protected $casts = [
        'variant_id' => 'integer',
        'quantity' => 'integer',
        'is_optional' => 'boolean',
        // What taking an optional extra costs. Zero — the default and what
        // every bundle did before — means it is included in the bundle price.
        'surcharge' => 'decimal:2',
    ];

    public function combo(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'combo_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'item_id');
    }

    /** Which size of the child goes in, when the child is sold in sizes. */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(Variant::class, 'variant_id');
    }
}
