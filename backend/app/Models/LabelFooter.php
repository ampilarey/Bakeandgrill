<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A sticker footer to pick by name (owner, 2026-10-12: "No easy option to
 * select and edit branding footer"). The footer is always the business's
 * branding (owner, 2026-10-12: "Footer should be always branding of Bake
 * and Grill. Amma is a food brand label but the actual brand is under Bake
 * and Grill"): a food brand keeps its logo and name on the header, the
 * business signs the footer. A footer holds what it prints big, the tagline
 * or own words, phone, ways to reach you, website, address and landmark, in
 * English and Dhivehi, and whether the complaints QR and the brand mark go
 * in. A blank line takes Business Details' live value, so the seeded
 * "Standard" footer follows the business as it changes. A custom label, a
 * label type (as its default) or a whole sheet picks one; with none picked
 * a sticker prints the standard one.
 */
class LabelFooter extends Model
{
    /** The lines that fall back to the business's values when blank. */
    public const LINES = ['heading', 'heading_dv', 'tagline', 'tagline_dv', 'phone', 'ways', 'ways_dv', 'website', 'address', 'address_dv', 'landmark', 'landmark_dv'];

    /**
     * The looks a footer prints in (owner, 2026-10-12: "different styles"):
     * the dark band, a light band, the rust band, no band (a rule above the
     * lines) or the dark band with the whole logo. StickerDesign::footerPalette().
     */
    public const STYLES = ['dark', 'light', 'rust', 'plain', 'logo'];

    protected $fillable = [
        'name', 'style', 'heading', 'heading_dv', 'tagline', 'tagline_dv',
        'phone', 'ways', 'ways_dv', 'website', 'address', 'address_dv', 'landmark', 'landmark_dv',
        'show_qr', 'show_mark', 'is_default', 'sort',
    ];

    protected function casts(): array
    {
        return ['show_qr' => 'boolean', 'show_mark' => 'boolean', 'is_default' => 'boolean', 'sort' => 'integer'];
    }

    public function customLabels(): HasMany
    {
        return $this->hasMany(CustomLabel::class, 'footer_id');
    }

    public function types(): HasMany
    {
        return $this->hasMany(LabelType::class, 'footer_id');
    }

    /** The footer a sticker prints when nothing picked one: the one marked standard, else the first. */
    public static function default(): ?self
    {
        return static::query()->where('is_default', true)->orderBy('id')->first() ?? static::query()->orderBy('sort')->orderBy('id')->first();
    }
}
