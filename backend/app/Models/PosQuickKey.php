<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One pinned item on a till's Quick tab. See the migration for the shape.
 *
 * @property int $id
 * @property int|null $user_id
 * @property int $item_id
 * @property int $sort_order
 */
class PosQuickKey extends Model
{
    protected $fillable = ['user_id', 'item_id', 'sort_order'];

    protected $casts = [
        'user_id' => 'integer',
        'item_id' => 'integer',
        'sort_order' => 'integer',
    ];
}
