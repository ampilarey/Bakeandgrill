<?php

declare(strict_types=1);

namespace App\Models;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Item extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'category_id',
        'menu_group_id',
        'name',
        'name_dv',
        'card_name',
        'card_name_dv',
        'description',
        'short_description',
        'short_description_dv',
        'sku',
        'barcode',
        'image_url',
        'image_original_url',
        'thumb_url',
        'image_webp_url',
        'thumb_webp_url',
        'base_price',
        'price_note',
        'packaging_fee',
        'packaging_fee_mode',
        'has_variants',
        'cost',
        'tax_rate',
        'tax_code',
        'is_active',
        'is_available',
        'snoozed_until',
        'unavailable_reason_note',
        'sort_order',
        'stock_quantity',
        'low_stock_threshold',
        'track_stock',
        'availability_type',
        'allow_pre_order',
        'tomorrow_daily_capacity',
        'pre_order_lead_time_minutes',
        'dietary_tags',
        'allergens',
        'calories',
        'prep_time_minutes',
        'spice_level',
        'is_combo',
        'combo_discount_pct',
        'show_on_signage',
        'is_signage_promoted',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function menuGroup(): BelongsTo
    {
        return $this->belongsTo(MenuGroup::class, 'menu_group_id');
    }

    public function channelAvailabilities(): HasMany
    {
        return $this->hasMany(ItemChannelAvailability::class, 'item_id');
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

    public function packagingOptions(): HasMany
    {
        return $this->hasMany(ItemPackagingOption::class)->orderBy('sort_order')->orderBy('id');
    }

    public function activePackagingOptions(): HasMany
    {
        return $this->packagingOptions()->where('is_active', true);
    }

    public function recipe(): HasOne
    {
        return $this->hasOne(Recipe::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function comboItems(): HasMany
    {
        return $this->hasMany(ComboItem::class, 'combo_id');
    }

    /** Choice groups for build-your-own platters (is_combo items with selectable contents). */
    public function platterGroups(): HasMany
    {
        return $this->hasMany(PlatterGroup::class)->orderBy('sort_order')->orderBy('id');
    }

    /** True when this combo has at least one choice group (platter, not fixed bundle). */
    public function isPlatter(): bool
    {
        if ($this->relationLoaded('platterGroups')) {
            return $this->platterGroups->isNotEmpty();
        }

        return $this->platterGroups()->exists();
    }

    public function photos(): HasMany
    {
        return $this->hasMany(ItemPhoto::class)->orderBy('sort_order');
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
        'category_id' => 'integer',
        'menu_group_id' => 'integer',
        'is_active' => 'boolean',
        'is_available' => 'boolean',
        'snoozed_until' => 'datetime',
        'has_variants' => 'boolean',
        'track_stock' => 'boolean',
        'allow_pre_order' => 'boolean',
        'base_price' => 'decimal:2',
        'packaging_fee' => 'decimal:2',
        'cost' => 'decimal:2',
        'tax_rate' => 'decimal:2',
        'stock_quantity' => 'integer',
        'low_stock_threshold' => 'integer',
        'tomorrow_daily_capacity' => 'integer',
        'pre_order_lead_time_minutes' => 'integer',
        'dietary_tags' => 'array',
        'allergens' => 'array',
        'calories' => 'integer',
        'prep_time_minutes' => 'integer',
        'is_combo' => 'boolean',
        'combo_discount_pct' => 'decimal:2',
        'show_on_signage' => 'boolean',
        'is_signage_promoted' => 'boolean',
    ];

    /** True when the item is configured to require a variant selection. */
    public function hasVariants(): bool
    {
        return (bool) $this->has_variants;
    }

    /** Active variants ordered by sort_order. */
    public function activeVariants(): HasMany
    {
        return $this->variants()->where('is_active', true)->orderBy('sort_order');
    }

    /**
     * Price to display on menus.
     * For variant items returns the minimum active variant price ("From X").
     * Falls back to base_price for simple items.
     */
    public function displayPrice(): float
    {
        if ($this->has_variants) {
            $min = $this->variants()
                ->where('is_active', true)
                ->min('price');

            if ($min !== null) {
                return (float) $min;
            }
        }

        return (float) $this->base_price;
    }

    /** True while an "86 today" snooze is active. */
    public function isSnoozed(?\DateTimeInterface $at = null): bool
    {
        if ($this->snoozed_until === null) {
            return false;
        }

        $at ??= now();

        return $this->snoozed_until->gt($at);
    }

    protected static function booted(): void
    {
        static::creating(function (Item $item): void {
            if ($item->menu_group_id === null) {
                $item->menu_group_id = 1;
            }
        });

        static::created(function (Item $item): void {
            foreach (KitchenMenuResolver::CHANNELS as $channel) {
                ItemChannelAvailability::firstOrCreate(
                    [
                        'item_id' => $item->id,
                        'channel' => $channel,
                    ],
                    [
                        'is_enabled' => $channel !== 'catering',
                        'valid_from' => null,
                        'valid_until' => null,
                    ],
                );
            }
        });
    }
}
