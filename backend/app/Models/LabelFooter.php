<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A sticker footer to pick by name (owner, 2026-10-12: "No easy option to
 * select and edit branding footer"): what it prints big, the tagline, who
 * it is by, phone, ways to reach you, website, address and landmark, in
 * English and Dhivehi, and whether the complaints QR and the brand mark go
 * in. A blank line takes the brand's or Business Details' live value, so
 * the seeded "Standard" footer follows the business as it changes. A custom
 * label, a label type (as its default) or a whole sheet picks one; with
 * none picked a sticker prints its brand's footer as before.
 */
class LabelFooter extends Model
{
    /** The lines that fall back to the brand's and the business's values when blank. */
    public const LINES = ['heading', 'heading_dv', 'tagline', 'tagline_dv', 'by_line', 'phone', 'ways', 'ways_dv', 'website', 'address', 'address_dv', 'landmark', 'landmark_dv'];

    protected $fillable = [
        'name', 'brand_id', 'heading', 'heading_dv', 'tagline', 'tagline_dv', 'by_line', 'show_by',
        'phone', 'ways', 'ways_dv', 'website', 'address', 'address_dv', 'landmark', 'landmark_dv',
        'show_qr', 'show_mark', 'is_default', 'sort',
    ];

    protected function casts(): array
    {
        return ['brand_id' => 'integer', 'show_by' => 'boolean', 'show_qr' => 'boolean', 'show_mark' => 'boolean', 'is_default' => 'boolean', 'sort' => 'integer'];
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(LabelBrand::class, 'brand_id');
    }

    public function customLabels(): HasMany
    {
        return $this->hasMany(CustomLabel::class, 'footer_id');
    }

    public function types(): HasMany
    {
        return $this->hasMany(LabelType::class, 'footer_id');
    }

    /** The footer a sheet-level or type-level "standard" choice means: the one marked default, else the first. */
    public static function default(): ?self
    {
        return static::query()->where('is_default', true)->orderBy('id')->first() ?? static::query()->orderBy('sort')->orderBy('id')->first();
    }
}
