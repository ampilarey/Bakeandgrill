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

    /**
     * A brand's name as it is matched: lower case, no possessive, letters and
     * digits only (owner, 2026-11-12: the brand typed as "Amma’s" was not the
     * shipped "Amma", so its template did not pick it and its logo never
     * showed). "Amma", "Amma's", "Amma’s" and "AMMA'S" are one key, "amma".
     */
    public static function key(string $name): string
    {
        $name = (string) preg_replace("/[’'`]s\\b/iu", '', mb_strtolower(trim($name)));

        return trim((string) preg_replace('/[^a-z0-9]+/', '-', $name), '-');
    }

    /** The brand a shipped name means, however it was typed. */
    public static function named(string $name): ?self
    {
        $key = self::key($name);

        return $key === '' ? null : self::query()->orderBy('id')->get()->first(fn (self $b) => self::key((string) $b->name) === $key);
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
