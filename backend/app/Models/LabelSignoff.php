<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A sign-off of one product's legal lines (round 17, the wording lock):
 * what was approved, by whom and when. Never edited.
 */
class LabelSignoff extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['kind', 'product_id', 'size_id', 'hash', 'lines', 'note', 'signed_by'];

    protected $casts = ['lines' => 'array', 'product_id' => 'integer', 'size_id' => 'integer'];

    public function signer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'signed_by');
    }
}
