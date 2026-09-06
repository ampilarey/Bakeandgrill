<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Recipe extends Model
{
    protected $fillable = [
        'item_id',
        'yield_quantity',
        'limits_availability',
        'consumed_at',
        'instructions',
        'total_cost',
    ];

    protected $casts = [
        'yield_quantity' => 'float',
        'limits_availability' => 'boolean',
        'total_cost' => 'float',
    ];

    /** Ingredients leave the store when the dish is sold. The default. */
    public const CONSUMED_AT_SALE = 'sale';

    /** Ingredients leave the store when the kitchen records producing the dish. */
    public const CONSUMED_AT_PRODUCTION = 'production';

    public function consumedAtProduction(): bool
    {
        return $this->consumed_at === self::CONSUMED_AT_PRODUCTION;
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function recipeItems(): HasMany
    {
        return $this->hasMany(RecipeItem::class);
    }
}
