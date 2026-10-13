<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A pack sticker for something that is not on the menu (owner, 2026-10-11:
 * "Add option to add custom labels using different brands logos and other
 * details. Not only from the menu list"). Its label columns are named as the
 * items' are, so the sticker reads both the same way.
 */
class CustomLabel extends Model
{
    protected $fillable = [
        'name', 'name_dv', 'brand_id', 'label_type_id', 'label_storage',
        'label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv',
        'label_ingredients', 'label_ingredients_dv', 'label_how_to_use', 'label_how_to_use_dv',
        'label_note', 'label_note_dv', 'footer_id', 'label_show_qr', 'label_lang',
        'label_shelf_life_days', 'label_pack_qty', 'label_pack_unit',
        'label_price', 'label_barcode', 'label_net_weight', 'label_allergens', 'label_nutrition',
        'label_wrap', 'label_nutrition_per', 'label_layout',
        'label_photo_media_id', 'label_title_media_id', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'brand_id' => 'integer',
            'label_type_id' => 'integer',
            'footer_id' => 'integer',
            'label_shelf_life_days' => 'integer',
            'label_pack_qty' => 'integer',
            'label_price' => 'decimal:2',
            'label_show_qr' => 'boolean',
            'label_wrap' => 'array',
            'label_layout' => 'array',
            'label_photo_media_id' => 'integer',
            'label_title_media_id' => 'integer',
        ];
    }

    /** Every sheet this label was printed on (the print log). */
    public function prints(): HasMany
    {
        return $this->hasMany(LabelPrint::class, 'custom_label_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(LabelBrand::class, 'brand_id');
    }

    /** The footer preset it prints (owner, 2026-10-12); null prints its brand's footer. */
    public function footer(): BelongsTo
    {
        return $this->belongsTo(LabelFooter::class, 'footer_id');
    }

    public function labelType(): BelongsTo
    {
        return $this->belongsTo(LabelType::class, 'label_type_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
