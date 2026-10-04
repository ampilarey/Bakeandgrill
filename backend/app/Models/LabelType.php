<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * What kind of food a label is for ("Frozen Hedhika"), with the wording that
 * goes with it: heading, storage and its line, the date box labels, a
 * use-within line, how to use, a note, a shelf life, and whether the
 * complaints QR prints. Items pick a type. docs/LABEL_HUB_V2_PLAN.md point 3.
 */
class LabelType extends Model
{
    public const STORAGES = ['frozen', 'chilled', 'ambient'];

    protected $fillable = [
        'brand_id', 'name', 'heading', 'heading_dv', 'storage', 'storage_line', 'storage_line_dv',
        'use_within', 'use_within_dv', 'mfg_label', 'exp_label', 'how_to_use', 'how_to_use_dv',
        'note', 'note_dv', 'shelf_life_days', 'show_qr', 'is_active', 'sort',
    ];

    protected function casts(): array
    {
        return ['show_qr' => 'boolean', 'is_active' => 'boolean', 'sort' => 'integer', 'shelf_life_days' => 'integer', 'brand_id' => 'integer'];
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(LabelBrand::class, 'brand_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'label_type_id');
    }
}
