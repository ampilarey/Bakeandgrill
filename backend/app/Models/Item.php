<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Item extends Model
{
    use SoftDeletes;
    protected $fillable = [
        'category_id',
        'name',
        'name_dv',
        'description',
        'sku',
        'barcode',
        'image_url',
        'base_price',
        'cost',
        'tax_rate',
        'is_active',
        'is_available',
        'sort_order',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(Variant::class);
    }

    public function modifiers(): BelongsToMany
    {
        return $this->belongsToMany(Modifier::class, 'item_modifier')
            ->withPivot(['is_required', 'max_quantity'])
            ->withTimestamps();
    }

    public function recipe(): HasOne
    {
        return $this->hasOne(Recipe::class);
    }
}
