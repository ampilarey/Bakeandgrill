<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryCategory extends Model
{
    protected $fillable = ['name', 'slug', 'description', 'is_active'];

    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'inventory_category_id');
    }
}
