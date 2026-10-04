<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Who a label is from: the business itself (is_default, details from Business
 * Details) or a brand under it such as Amma, with its own name, tagline and
 * PNG logo. docs/LABEL_HUB_V2_PLAN.md point 6.
 */
class LabelBrand extends Model
{
    protected $fillable = ['name', 'name_dv', 'tagline', 'tagline_dv', 'logo_media_id', 'is_default', 'sort'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'sort' => 'integer', 'logo_media_id' => 'integer'];
    }

    public function logo(): BelongsTo
    {
        return $this->belongsTo(Media::class, 'logo_media_id');
    }

    public function types(): HasMany
    {
        return $this->hasMany(LabelType::class, 'brand_id');
    }

    public static function default(): ?self
    {
        return static::query()->where('is_default', true)->orderBy('id')->first() ?? static::query()->orderBy('sort')->orderBy('id')->first();
    }
}
