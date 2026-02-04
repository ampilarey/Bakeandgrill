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
        'stock_quantity',
        'low_stock_threshold',
        'track_stock',
        'availability_type',
        'allow_pre_order',
        'pre_order_lead_time_minutes',
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

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * URL to use for display (direct local cafe image or original for external).
     */
    public function getDisplayImageUrlAttribute(): ?string
    {
        if ($this->image_url === null || $this->image_url === '') {
            return $this->image_url;
        }
        $path = trim(preg_replace('#^https?://[^/]+#', '', $this->image_url), '/');
        if (str_starts_with($path, 'images/cafe/')) {
            return url($path);
        }
        return $this->image_url;
    }

    protected $casts = [
        'is_active' => 'boolean',
        'is_available' => 'boolean',
        'track_stock' => 'boolean',
        'allow_pre_order' => 'boolean',
        'base_price' => 'decimal:2',
        'cost' => 'decimal:2',
        'tax_rate' => 'decimal:2',
        'stock_quantity' => 'integer',
        'low_stock_threshold' => 'integer',
        'pre_order_lead_time_minutes' => 'integer',
    ];
}
