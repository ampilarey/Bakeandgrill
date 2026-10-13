<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved label template (round 7, owner, 2026-10-13: "Save as template from
 * any label"): a label's settings without the product (`fields`, the keys in
 * App\Domains\Labels\LabelTemplates::KEYS), the size it printed at (`size`,
 * a size choice as the Admin's picker holds it) and the label it came from
 * (`source`). Applied with Start from on a new custom label or a menu item's
 * label.
 */
class LabelTemplate extends Model
{
    protected $fillable = ['name', 'source', 'fields', 'size', 'created_by'];

    protected function casts(): array
    {
        return ['fields' => 'array', 'size' => 'array'];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
