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

    /**
     * The rows that apply to one size of the dish, in two piles.
     *
     * `shared` rows carry no size and are scaled by the size's "Uses"
     * factor — beetle leaf, one leaf per full, half a leaf per half.
     * `own` rows belong to this size alone and are taken exactly as
     * written — a 1.5L bottle for the 1.5L size, never scaled. With no
     * size given, only the shared rows apply.
     *
     * @return array{shared: \Illuminate\Support\Collection<int, RecipeItem>, own: \Illuminate\Support\Collection<int, RecipeItem>}
     */
    public function rowsFor(?Variant $variant): array
    {
        $rows = $this->relationLoaded('recipeItems')
            ? $this->recipeItems
            : $this->recipeItems()->with('inventoryItem')->get();

        return [
            'shared' => $rows->filter(fn (RecipeItem $r) => $r->variant_id === null)->values(),
            'own' => $variant === null
                ? collect()
                : $rows->filter(fn (RecipeItem $r) => (int) $r->variant_id === (int) $variant->id)->values(),
        ];
    }

    /** Does any row belong to a particular size? */
    public function hasSizedRows(): bool
    {
        $rows = $this->relationLoaded('recipeItems') ? $this->recipeItems : $this->recipeItems()->get();

        return $rows->contains(fn (RecipeItem $r) => $r->variant_id !== null);
    }
}
