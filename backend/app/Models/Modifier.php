<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Modifier extends Model
{
    protected $fillable = [
        'name',
        'name_dv',
        'price',
        'is_active',
        'sort_order',
    ];

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(Item::class, 'item_modifier')
            ->withPivot(['is_required', 'max_quantity'])
            ->withTimestamps();
    }
}
