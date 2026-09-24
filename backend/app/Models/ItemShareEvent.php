<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A customer pressed Share on an item or category (website or order app). */
class ItemShareEvent extends Model
{
    public const CHANNELS = ['native', 'copy', 'whatsapp', 'telegram', 'viber', 'facebook', 'x'];

    public $timestamps = false;

    protected $fillable = ['item_id', 'category_id', 'channel', 'surface', 'created_at'];

    protected $casts = ['created_at' => 'datetime'];
}
