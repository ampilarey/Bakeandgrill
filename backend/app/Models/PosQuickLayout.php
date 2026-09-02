<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A till's Quick tabs, one row per owner. See the migration for the shape.
 *
 * @property int $id
 * @property int|null $user_id
 * @property array<int, array{id: string, name: string, items: list<int>, from: string|null, to: string|null}> $tabs
 */
class PosQuickLayout extends Model
{
    protected $fillable = ['user_id', 'tabs'];

    protected $casts = [
        'user_id' => 'integer',
        'tabs' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
